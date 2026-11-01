import json
import os
import sqlite3
from datetime import UTC, datetime
from collections.abc import Iterator
from contextlib import closing, contextmanager
from pathlib import Path
from uuid import uuid4

# The original (version 0) schema. Later changes are MIGRATIONS, so fresh and existing
# databases are upgraded the same way.
SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    username TEXT NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS boards (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS columns (
    id TEXT PRIMARY KEY,
    board_id INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    position INTEGER NOT NULL,
    UNIQUE (board_id, position)
);
CREATE TABLE IF NOT EXISTS cards (
    id TEXT PRIMARY KEY,
    column_id TEXT NOT NULL REFERENCES columns(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    details TEXT NOT NULL DEFAULT '',
    position INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS cards_column_position ON cards (column_id, position);
"""

# Migration N (1-based) upgrades the database from user_version N-1 to N. Append only.
MIGRATIONS = [
    "ALTER TABLE users ADD COLUMN password_hash TEXT;",
    # Several titled boards per user: rebuild boards without UNIQUE(user_id), keeping ids.
    """
    CREATE TABLE boards_new (
        id INTEGER PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title TEXT NOT NULL
    );
    INSERT INTO boards_new (id, user_id, title) SELECT id, user_id, 'My board' FROM boards;
    DROP TABLE boards;
    ALTER TABLE boards_new RENAME TO boards;
    CREATE INDEX boards_user ON boards (user_id);
    """,
    # Card priority, due date (ISO date) and labels (JSON array of strings).
    """
    ALTER TABLE cards ADD COLUMN priority TEXT NOT NULL DEFAULT 'none'
        CHECK (priority IN ('none', 'low', 'medium', 'high'));
    ALTER TABLE cards ADD COLUMN due_date TEXT;
    ALTER TABLE cards ADD COLUMN labels TEXT NOT NULL DEFAULT '[]';
    """,
    # Boards shared with other users; the owner stays boards.user_id.
    """
    CREATE TABLE board_members (
        board_id INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        PRIMARY KEY (board_id, user_id)
    );
    CREATE INDEX board_members_user ON board_members (user_id);
    """,
    # Card comments and the board activity log. user_id is null once the account is deleted.
    """
    CREATE TABLE comments (
        id TEXT PRIMARY KEY,
        card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        text TEXT NOT NULL,
        created_at TEXT NOT NULL
    );
    CREATE INDEX comments_card ON comments (card_id, created_at);
    CREATE TABLE activity (
        id INTEGER PRIMARY KEY,
        board_id INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        message TEXT NOT NULL,
        created_at TEXT NOT NULL
    );
    CREATE INDEX activity_board ON activity (board_id, id);
    """,
    # Checklist items on cards, in order.
    """
    CREATE TABLE checklist_items (
        id TEXT PRIMARY KEY,
        card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
        text TEXT NOT NULL,
        done INTEGER NOT NULL DEFAULT 0 CHECK (done IN (0, 1)),
        position INTEGER NOT NULL
    );
    CREATE INDEX checklist_items_card ON checklist_items (card_id, position);
    """,
    # Usernames are unique ignoring case ("Alice" and "alice" are one account). Fails, and
    # leaves the database at version 6, if two existing names differ only in case.
    "CREATE UNIQUE INDEX users_username_nocase ON users (username COLLATE NOCASE);",
]

# Default board for a new user: column title -> [(card title, card details)].
DEFAULT_BOARD = {
    "Backlog": [
        ("Align roadmap themes", "Draft quarterly themes with impact statements and metrics."),
        ("Gather customer signals", "Review support tags, sales notes, and churn feedback."),
    ],
    "Discovery": [
        ("Prototype analytics view", "Sketch initial dashboard layout and key drill-downs."),
    ],
    "In Progress": [
        ("Refine status language", "Standardize column labels and tone across the board."),
        ("Design card layout", "Add hierarchy and spacing for scanning dense lists."),
    ],
    "Review": [
        ("QA micro-interactions", "Verify hover, focus, and loading states."),
    ],
    "Done": [
        ("Ship marketing page", "Final copy approved and asset pack delivered."),
        ("Close onboarding sprint", "Document release notes and share internally."),
    ],
}


class NotFound(Exception):
    pass


class Conflict(Exception):
    pass


class Forbidden(Exception):
    pass


# backend/data/pm.db, regardless of the working directory (/app/data/pm.db in Docker).
DEFAULT_DB_PATH = Path(__file__).resolve().parent.parent / "data" / "pm.db"


def db_path() -> Path:
    return Path(os.environ.get("DB_PATH", DEFAULT_DB_PATH))


def _connect() -> sqlite3.Connection:
    # isolation_level=None: transactions are controlled explicitly in transaction().
    conn = sqlite3.connect(db_path(), isolation_level=None)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db() -> None:
    db_path().parent.mkdir(parents=True, exist_ok=True)
    with closing(_connect()) as conn:
        conn.executescript(SCHEMA)
        migrate(conn)


def migrate(conn: sqlite3.Connection) -> None:
    """Apply pending migrations, each in its own transaction with its version bump."""
    # Off while tables are rebuilt, so dropping a table does not cascade to its children.
    conn.execute("PRAGMA foreign_keys = OFF")
    while True:
        conn.execute("BEGIN IMMEDIATE")
        try:
            # Read under the write lock, so concurrent starts never apply a migration twice.
            version = conn.execute("PRAGMA user_version").fetchone()[0]
            if version >= len(MIGRATIONS):
                conn.execute("COMMIT")
                break
            _run_script(conn, MIGRATIONS[version])
            conn.execute(f"PRAGMA user_version = {version + 1}")
            if conn.execute("PRAGMA foreign_key_check").fetchone():
                raise sqlite3.IntegrityError(f"Migration {version + 1} broke a foreign key")
        except BaseException:
            conn.execute("ROLLBACK")
            raise
        conn.execute("COMMIT")
    conn.execute("PRAGMA foreign_keys = ON")


def _run_script(conn: sqlite3.Connection, script: str) -> None:
    # executescript() would COMMIT first; run the statements inside the open transaction.
    # Migrations are plain DDL/DML without semicolons inside strings.
    for statement in script.split(";"):
        if statement.strip():
            conn.execute(statement)


@contextmanager
def transaction() -> Iterator[sqlite3.Connection]:
    """Run a block in one write transaction: commit on success, roll back on error.

    BEGIN IMMEDIATE takes the write lock up front, so reads inside the block see a
    consistent board and concurrent changes run one after another.
    """
    with closing(_connect()) as conn:
        conn.execute("BEGIN IMMEDIATE")
        try:
            yield conn
        except BaseException:
            conn.execute("ROLLBACK")
            raise
        conn.execute("COMMIT")


def new_id(prefix: str) -> str:
    return f"{prefix}-{uuid4().hex[:12]}"


def create_user(conn: sqlite3.Connection, username: str, password_hash: str) -> int:
    try:
        return conn.execute(
            "INSERT INTO users (username, password_hash) VALUES (?, ?)", (username, password_hash)
        ).lastrowid
    except sqlite3.IntegrityError:
        raise Conflict(f"Username {username} is taken")


def get_user(conn: sqlite3.Connection, username: str) -> sqlite3.Row | None:
    return conn.execute(
        "SELECT id, username, password_hash FROM users WHERE username = ? COLLATE NOCASE",
        (username,),
    ).fetchone()


def get_user_by_id(conn: sqlite3.Connection, user_id: int) -> sqlite3.Row | None:
    return conn.execute(
        "SELECT id, username, password_hash FROM users WHERE id = ?", (user_id,)
    ).fetchone()


def set_password_hash(conn: sqlite3.Connection, user_id: int, password_hash: str) -> None:
    conn.execute("UPDATE users SET password_hash = ? WHERE id = ?", (password_hash, user_id))


def delete_user(conn: sqlite3.Connection, user_id: int) -> None:
    """Delete a user; their boards, columns and cards go with them (ON DELETE CASCADE)."""
    conn.execute("DELETE FROM users WHERE id = ?", (user_id,))


def create_board(conn: sqlite3.Connection, user_id: int, title: str, demo_cards: bool = False) -> int:
    """Create a board with the default columns, optionally filled with the demo cards."""
    board_id = conn.execute(
        "INSERT INTO boards (user_id, title) VALUES (?, ?)", (user_id, title)
    ).lastrowid
    for column_position, (column_title, cards) in enumerate(DEFAULT_BOARD.items()):
        column_id = new_id("col")
        conn.execute(
            "INSERT INTO columns (id, board_id, title, position) VALUES (?, ?, ?, ?)",
            (column_id, board_id, column_title, column_position),
        )
        for card_position, (title, details) in enumerate(cards if demo_cards else []):
            conn.execute(
                "INSERT INTO cards (id, column_id, title, details, position) VALUES (?, ?, ?, ?, ?)",
                (new_id("card"), column_id, title, details, card_position),
            )
    return board_id


BOARD_SUMMARY = """
    SELECT boards.id, boards.title, users.username AS owner, boards.user_id = :user AS is_owner
    FROM boards JOIN users ON users.id = boards.user_id
"""
# Boards the user owns or is a member of.
ACCESSIBLE = """(boards.user_id = :user
    OR boards.id IN (SELECT board_id FROM board_members WHERE user_id = :user))"""


def _summary(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "title": row["title"],
        "owner": row["owner"],
        "isOwner": bool(row["is_owner"]),
    }


def list_boards(conn: sqlite3.Connection, user_id: int) -> list[dict]:
    """Boards the user owns or shares, oldest first. A user owning none gets a demo board."""
    if not conn.execute("SELECT 1 FROM boards WHERE user_id = ?", (user_id,)).fetchone():
        create_board(conn, user_id, "My board", demo_cards=True)
    return [
        _summary(row)
        for row in conn.execute(
            f"{BOARD_SUMMARY} WHERE {ACCESSIBLE} ORDER BY boards.id", {"user": user_id}
        )
    ]


def board_summary(conn: sqlite3.Connection, user_id: int, board_id: int) -> dict:
    require_board(conn, user_id, board_id)
    row = conn.execute(
        f"{BOARD_SUMMARY} WHERE boards.id = :board", {"user": user_id, "board": board_id}
    ).fetchone()
    return _summary(row)


def require_board(conn: sqlite3.Connection, user_id: int, board_id: int) -> None:
    """The board must be the user's own or shared with them; otherwise it does not exist for them."""
    if not conn.execute(
        f"SELECT 1 FROM boards WHERE id = :board AND {ACCESSIBLE}",
        {"board": board_id, "user": user_id},
    ).fetchone():
        raise NotFound(f"Board {board_id} not found")


def require_owner(conn: sqlite3.Connection, user_id: int, board_id: int) -> None:
    require_board(conn, user_id, board_id)
    if not conn.execute(
        "SELECT 1 FROM boards WHERE id = ? AND user_id = ?", (board_id, user_id)
    ).fetchone():
        raise Forbidden("Only the board's owner can do this")


def list_members(conn: sqlite3.Connection, board_id: int) -> dict:
    owner = conn.execute(
        "SELECT username FROM boards JOIN users ON users.id = boards.user_id WHERE boards.id = ?",
        (board_id,),
    ).fetchone()["username"]
    members = [
        row["username"]
        for row in conn.execute(
            """SELECT username FROM board_members JOIN users ON users.id = board_members.user_id
               WHERE board_id = ? ORDER BY username""",
            (board_id,),
        )
    ]
    return {"owner": owner, "members": members}


def add_member(conn: sqlite3.Connection, board_id: int, username: str) -> None:
    user = get_user(conn, username)
    if user is None:
        raise NotFound(f"User {username} not found")
    owner_id = conn.execute("SELECT user_id FROM boards WHERE id = ?", (board_id,)).fetchone()[0]
    if user["id"] == owner_id:
        raise Conflict(f"{username} owns this board")
    try:
        conn.execute(
            "INSERT INTO board_members (board_id, user_id) VALUES (?, ?)", (board_id, user["id"])
        )
    except sqlite3.IntegrityError:
        raise Conflict(f"{username} is already a member")


def remove_member(conn: sqlite3.Connection, board_id: int, username: str) -> None:
    removed = conn.execute(
        """DELETE FROM board_members
           WHERE board_id = ?
             AND user_id = (SELECT id FROM users WHERE username = ? COLLATE NOCASE)""",
        (board_id, username),
    ).rowcount
    if not removed:
        raise NotFound(f"{username} is not a member")


def rename_board(conn: sqlite3.Connection, user_id: int, board_id: int, title: str) -> None:
    require_owner(conn, user_id, board_id)
    conn.execute("UPDATE boards SET title = ? WHERE id = ?", (title, board_id))


def delete_board(conn: sqlite3.Connection, user_id: int, board_id: int) -> None:
    """Delete a board with its columns and cards. A user always keeps at least one own board."""
    require_owner(conn, user_id, board_id)
    count = conn.execute("SELECT COUNT(*) FROM boards WHERE user_id = ?", (user_id,)).fetchone()[0]
    if count == 1:
        raise Conflict("Cannot delete the only board")
    conn.execute("DELETE FROM boards WHERE id = ?", (board_id,))


def get_board(conn: sqlite3.Connection, board_id: int) -> dict:
    """Return the board in the frontend BoardData shape."""
    columns = [
        {"id": row["id"], "title": row["title"], "cardIds": []}
        for row in conn.execute(
            "SELECT id, title FROM columns WHERE board_id = ? ORDER BY position", (board_id,)
        )
    ]
    columns_by_id = {column["id"]: column for column in columns}
    cards = {}
    for row in conn.execute(
        """SELECT cards.id, cards.column_id, cards.title, cards.details, cards.priority,
                  cards.due_date, cards.labels FROM cards
           JOIN columns ON columns.id = cards.column_id
           WHERE columns.board_id = ? ORDER BY cards.position""",
        (board_id,),
    ):
        columns_by_id[row["column_id"]]["cardIds"].append(row["id"])
        cards[row["id"]] = {
            "id": row["id"],
            "title": row["title"],
            "details": row["details"],
            "priority": row["priority"],
            "dueDate": row["due_date"],
            "labels": json.loads(row["labels"]),
            "checklist": [],
        }
    for row in conn.execute(
        """SELECT checklist_items.id, card_id, text, done FROM checklist_items
           JOIN cards ON cards.id = checklist_items.card_id
           JOIN columns ON columns.id = cards.column_id
           WHERE columns.board_id = ? ORDER BY checklist_items.position""",
        (board_id,),
    ):
        cards[row["card_id"]]["checklist"].append(
            {"id": row["id"], "text": row["text"], "done": bool(row["done"])}
        )
    return {"columns": columns, "cards": cards}


def _require_column(conn: sqlite3.Connection, board_id: int, column_id: str) -> None:
    if not conn.execute(
        "SELECT 1 FROM columns WHERE id = ? AND board_id = ?", (column_id, board_id)
    ).fetchone():
        raise NotFound(f"Column {column_id} not found")


def _card_column_id(conn: sqlite3.Connection, board_id: int, card_id: str) -> str:
    row = conn.execute(
        """SELECT cards.column_id FROM cards JOIN columns ON columns.id = cards.column_id
           WHERE cards.id = ? AND columns.board_id = ?""",
        (card_id, board_id),
    ).fetchone()
    if not row:
        raise NotFound(f"Card {card_id} not found")
    return row["column_id"]


def _card_ids(conn: sqlite3.Connection, column_id: str) -> list[str]:
    return [
        row["id"]
        for row in conn.execute(
            "SELECT id FROM cards WHERE column_id = ? ORDER BY position", (column_id,)
        )
    ]


def _renumber(conn: sqlite3.Connection, column_id: str, card_ids: list[str]) -> None:
    conn.executemany(
        "UPDATE cards SET column_id = ?, position = ? WHERE id = ?",
        [(column_id, position, card_id) for position, card_id in enumerate(card_ids)],
    )


# The functions below that change a board return a description for the activity log.


def _column_title(conn: sqlite3.Connection, column_id: str) -> str:
    return conn.execute("SELECT title FROM columns WHERE id = ?", (column_id,)).fetchone()[0]


def _card_title(conn: sqlite3.Connection, card_id: str) -> str:
    return conn.execute("SELECT title FROM cards WHERE id = ?", (card_id,)).fetchone()[0]


def rename_column(conn: sqlite3.Connection, board_id: int, column_id: str, title: str) -> str:
    _require_column(conn, board_id, column_id)
    old_title = _column_title(conn, column_id)
    conn.execute("UPDATE columns SET title = ? WHERE id = ?", (title, column_id))
    return f'renamed column "{old_title}" to "{title}"'


MAX_COLUMNS = 20


def _column_ids(conn: sqlite3.Connection, board_id: int) -> list[str]:
    return [
        row["id"]
        for row in conn.execute(
            "SELECT id FROM columns WHERE board_id = ? ORDER BY position", (board_id,)
        )
    ]


def _renumber_columns(conn: sqlite3.Connection, column_ids: list[str]) -> None:
    # Through negative positions first: UNIQUE(board_id, position) would trip on a swap.
    for offset in (-len(column_ids), 0):
        conn.executemany(
            "UPDATE columns SET position = ? WHERE id = ?",
            [(offset + position, column_id) for position, column_id in enumerate(column_ids)],
        )


def add_column(conn: sqlite3.Connection, board_id: int, title: str) -> str:
    """Add a column at the right end of the board."""
    position = len(_column_ids(conn, board_id))
    if position >= MAX_COLUMNS:
        raise Conflict(f"A board has at most {MAX_COLUMNS} columns")
    conn.execute(
        "INSERT INTO columns (id, board_id, title, position) VALUES (?, ?, ?, ?)",
        (new_id("col"), board_id, title, position),
    )
    return f'added column "{title}"'


def move_column(conn: sqlite3.Connection, board_id: int, column_id: str, position: int) -> str:
    """Move a column to `position` (clamped), counted without the moved column."""
    _require_column(conn, board_id, column_id)
    column_ids = [cid for cid in _column_ids(conn, board_id) if cid != column_id]
    column_ids.insert(min(position, len(column_ids)), column_id)
    _renumber_columns(conn, column_ids)
    return f'moved column "{_column_title(conn, column_id)}"'


def delete_column(
    conn: sqlite3.Connection, board_id: int, column_id: str, move_cards_to: str | None
) -> str:
    """Delete a column. Its cards go to the bottom of `move_cards_to`, or are deleted."""
    _require_column(conn, board_id, column_id)
    title = _column_title(conn, column_id)
    column_ids = _column_ids(conn, board_id)
    if len(column_ids) == 1:
        raise Conflict("Cannot delete the only column")
    if move_cards_to is not None:
        _require_column(conn, board_id, move_cards_to)
        if move_cards_to == column_id:
            raise Conflict("Cannot move the cards into the column being deleted")
        _renumber(
            conn, move_cards_to, _card_ids(conn, move_cards_to) + _card_ids(conn, column_id)
        )
    # Any cards still in the column go with it (ON DELETE CASCADE).
    conn.execute("DELETE FROM columns WHERE id = ?", (column_id,))
    _renumber_columns(conn, [cid for cid in column_ids if cid != column_id])
    if move_cards_to is None:
        return f'deleted column "{title}"'
    return f'deleted column "{title}", moving its cards to "{_column_title(conn, move_cards_to)}"'


def create_card(
    conn: sqlite3.Connection,
    board_id: int,
    column_id: str,
    title: str,
    details: str = "",
    priority: str = "none",
    due_date: str | None = None,
    labels: list[str] | None = None,
) -> str:
    _require_column(conn, board_id, column_id)
    card_id = new_id("card")
    conn.execute(
        """INSERT INTO cards (id, column_id, title, details, priority, due_date, labels, position)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            card_id,
            column_id,
            title,
            details,
            priority,
            due_date,
            json.dumps(labels or []),
            len(_card_ids(conn, column_id)),
        ),
    )
    return f'added card "{title}" to "{_column_title(conn, column_id)}"'


CARD_FIELDS = {"title", "details", "priority", "due_date", "labels"}


def update_card(
    conn: sqlite3.Connection, board_id: int, card_id: str, changes: dict
) -> str | None:
    """Change the given fields (keys from CARD_FIELDS); other fields keep their values."""
    _card_column_id(conn, board_id, card_id)
    if not changes:
        return None
    assert changes.keys() <= CARD_FIELDS, changes.keys()
    values = {**changes}
    if "labels" in values:
        values["labels"] = json.dumps(values["labels"])
    # Column names come from CARD_FIELDS, never from the request.
    assignments = ", ".join(f"{field} = ?" for field in values)
    conn.execute(f"UPDATE cards SET {assignments} WHERE id = ?", (*values.values(), card_id))
    return f'edited card "{_card_title(conn, card_id)}"'


def delete_card(conn: sqlite3.Connection, board_id: int, card_id: str) -> str:
    column_id = _card_column_id(conn, board_id, card_id)
    title = _card_title(conn, card_id)
    conn.execute("DELETE FROM cards WHERE id = ?", (card_id,))
    _renumber(conn, column_id, _card_ids(conn, column_id))
    return f'deleted card "{title}"'


def move_card(
    conn: sqlite3.Connection, board_id: int, card_id: str, column_id: str, position: int
) -> str:
    """Move a card to `position` (clamped) in the target column, renumbering both columns."""
    source_id = _card_column_id(conn, board_id, card_id)
    _require_column(conn, board_id, column_id)

    source_ids = [cid for cid in _card_ids(conn, source_id) if cid != card_id]
    target_ids = source_ids if column_id == source_id else _card_ids(conn, column_id)
    target_ids.insert(max(0, min(position, len(target_ids))), card_id)

    _renumber(conn, column_id, target_ids)
    if column_id != source_id:
        _renumber(conn, source_id, source_ids)
        return f'moved card "{_card_title(conn, card_id)}" to "{_column_title(conn, column_id)}"'
    return f'reordered card "{_card_title(conn, card_id)}" in "{_column_title(conn, column_id)}"'


def _now() -> str:
    return datetime.now(UTC).isoformat(timespec="seconds")


def log_activity(conn: sqlite3.Connection, board_id: int, user_id: int, message: str) -> None:
    conn.execute(
        "INSERT INTO activity (board_id, user_id, message, created_at) VALUES (?, ?, ?, ?)",
        (board_id, user_id, message, _now()),
    )


ACTIVITY_LIMIT = 100


def list_activity(conn: sqlite3.Connection, board_id: int) -> list[dict]:
    """The board's latest activity, newest first."""
    return [
        {
            "id": row["id"],
            "author": row["username"],
            "message": row["message"],
            "createdAt": row["created_at"],
        }
        for row in conn.execute(
            """SELECT activity.id, username, message, created_at FROM activity
               LEFT JOIN users ON users.id = activity.user_id
               WHERE board_id = ? ORDER BY activity.id DESC LIMIT ?""",
            (board_id, ACTIVITY_LIMIT),
        )
    ]


def list_comments(conn: sqlite3.Connection, board_id: int, card_id: str, user_id: int) -> list[dict]:
    """A card's comments, oldest first; `mine` marks the ones the user may delete."""
    _card_column_id(conn, board_id, card_id)
    return [
        {
            "id": row["id"],
            "author": row["username"],
            "text": row["text"],
            "createdAt": row["created_at"],
            "mine": row["user_id"] == user_id,
        }
        for row in conn.execute(
            """SELECT comments.id, comments.user_id, username, text, created_at FROM comments
               LEFT JOIN users ON users.id = comments.user_id
               WHERE card_id = ? ORDER BY created_at, comments.rowid""",
            (card_id,),
        )
    ]


def add_comment(
    conn: sqlite3.Connection, board_id: int, card_id: str, user_id: int, text: str
) -> str:
    _card_column_id(conn, board_id, card_id)
    conn.execute(
        "INSERT INTO comments (id, card_id, user_id, text, created_at) VALUES (?, ?, ?, ?, ?)",
        (new_id("comment"), card_id, user_id, text, _now()),
    )
    return f'commented on "{_card_title(conn, card_id)}"'


def delete_comment(
    conn: sqlite3.Connection, board_id: int, card_id: str, comment_id: str, user_id: int
) -> None:
    """Only the author deletes a comment (not logged as activity)."""
    _card_column_id(conn, board_id, card_id)
    row = conn.execute(
        "SELECT user_id FROM comments WHERE id = ? AND card_id = ?", (comment_id, card_id)
    ).fetchone()
    if row is None:
        raise NotFound(f"Comment {comment_id} not found")
    if row["user_id"] != user_id:
        raise Forbidden("Only the author can delete a comment")
    conn.execute("DELETE FROM comments WHERE id = ?", (comment_id,))


MAX_CHECKLIST_ITEMS = 50


def _checklist_item(conn: sqlite3.Connection, board_id: int, card_id: str, item_id: str) -> sqlite3.Row:
    _card_column_id(conn, board_id, card_id)
    row = conn.execute(
        "SELECT text, done FROM checklist_items WHERE id = ? AND card_id = ?", (item_id, card_id)
    ).fetchone()
    if row is None:
        raise NotFound(f"Checklist item {item_id} not found")
    return row


def add_checklist_item(conn: sqlite3.Connection, board_id: int, card_id: str, text: str) -> str:
    _card_column_id(conn, board_id, card_id)
    count = conn.execute(
        "SELECT COUNT(*) FROM checklist_items WHERE card_id = ?", (card_id,)
    ).fetchone()[0]
    if count >= MAX_CHECKLIST_ITEMS:
        raise Conflict(f"A card has at most {MAX_CHECKLIST_ITEMS} checklist items")
    conn.execute(
        "INSERT INTO checklist_items (id, card_id, text, position) VALUES (?, ?, ?, ?)",
        (new_id("item"), card_id, text, count),
    )
    return f'added "{text}" to the checklist of "{_card_title(conn, card_id)}"'


def update_checklist_item(
    conn: sqlite3.Connection, board_id: int, card_id: str, item_id: str, changes: dict
) -> str | None:
    """Change the item's `text` and/or `done`; returns None when nothing was sent."""
    old = _checklist_item(conn, board_id, card_id, item_id)
    if not changes:
        return None
    text = changes.get("text", old["text"])
    done = changes.get("done", bool(old["done"]))
    conn.execute(
        "UPDATE checklist_items SET text = ?, done = ? WHERE id = ?", (text, done, item_id)
    )
    card = _card_title(conn, card_id)
    if done != bool(old["done"]):
        return f'{"checked" if done else "unchecked"} "{text}" on "{card}"'
    return f'edited the checklist of "{card}"'


def delete_checklist_item(
    conn: sqlite3.Connection, board_id: int, card_id: str, item_id: str
) -> str:
    text = _checklist_item(conn, board_id, card_id, item_id)["text"]
    conn.execute("DELETE FROM checklist_items WHERE id = ?", (item_id,))
    rest = [
        row["id"]
        for row in conn.execute(
            "SELECT id FROM checklist_items WHERE card_id = ? ORDER BY position", (card_id,)
        )
    ]
    conn.executemany(
        "UPDATE checklist_items SET position = ? WHERE id = ?",
        [(position, rest_id) for position, rest_id in enumerate(rest)],
    )
    return f'removed "{text}" from the checklist of "{_card_title(conn, card_id)}"'
