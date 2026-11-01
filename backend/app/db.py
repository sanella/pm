import os
import sqlite3
from collections.abc import Iterator
from contextlib import closing, contextmanager
from pathlib import Path
from uuid import uuid4

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


def get_or_create_board_id(conn: sqlite3.Connection, username: str) -> int:
    row = conn.execute(
        "SELECT boards.id FROM boards JOIN users ON users.id = boards.user_id WHERE username = ?",
        (username,),
    ).fetchone()
    if row:
        return row["id"]

    conn.execute("INSERT OR IGNORE INTO users (username) VALUES (?)", (username,))
    user_id = conn.execute("SELECT id FROM users WHERE username = ?", (username,)).fetchone()["id"]
    board_id = conn.execute("INSERT INTO boards (user_id) VALUES (?)", (user_id,)).lastrowid
    for column_position, (column_title, cards) in enumerate(DEFAULT_BOARD.items()):
        column_id = new_id("col")
        conn.execute(
            "INSERT INTO columns (id, board_id, title, position) VALUES (?, ?, ?, ?)",
            (column_id, board_id, column_title, column_position),
        )
        for card_position, (title, details) in enumerate(cards):
            conn.execute(
                "INSERT INTO cards (id, column_id, title, details, position) VALUES (?, ?, ?, ?, ?)",
                (new_id("card"), column_id, title, details, card_position),
            )
    return board_id


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
        """SELECT cards.id, cards.column_id, cards.title, cards.details FROM cards
           JOIN columns ON columns.id = cards.column_id
           WHERE columns.board_id = ? ORDER BY cards.position""",
        (board_id,),
    ):
        columns_by_id[row["column_id"]]["cardIds"].append(row["id"])
        cards[row["id"]] = {"id": row["id"], "title": row["title"], "details": row["details"]}
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


def rename_column(conn: sqlite3.Connection, board_id: int, column_id: str, title: str) -> None:
    _require_column(conn, board_id, column_id)
    conn.execute("UPDATE columns SET title = ? WHERE id = ?", (title, column_id))


def create_card(
    conn: sqlite3.Connection, board_id: int, column_id: str, title: str, details: str
) -> str:
    _require_column(conn, board_id, column_id)
    card_id = new_id("card")
    conn.execute(
        "INSERT INTO cards (id, column_id, title, details, position) VALUES (?, ?, ?, ?, ?)",
        (card_id, column_id, title, details, len(_card_ids(conn, column_id))),
    )
    return card_id


def update_card(
    conn: sqlite3.Connection, board_id: int, card_id: str, title: str, details: str
) -> None:
    _card_column_id(conn, board_id, card_id)
    conn.execute(
        "UPDATE cards SET title = ?, details = ? WHERE id = ?", (title, details, card_id)
    )


def delete_card(conn: sqlite3.Connection, board_id: int, card_id: str) -> None:
    column_id = _card_column_id(conn, board_id, card_id)
    conn.execute("DELETE FROM cards WHERE id = ?", (card_id,))
    _renumber(conn, column_id, _card_ids(conn, column_id))


def move_card(
    conn: sqlite3.Connection, board_id: int, card_id: str, column_id: str, position: int
) -> None:
    """Move a card to `position` (clamped) in the target column, renumbering both columns."""
    source_id = _card_column_id(conn, board_id, card_id)
    _require_column(conn, board_id, column_id)

    source_ids = [cid for cid in _card_ids(conn, source_id) if cid != card_id]
    target_ids = source_ids if column_id == source_id else _card_ids(conn, column_id)
    target_ids.insert(max(0, min(position, len(target_ids))), card_id)

    _renumber(conn, column_id, target_ids)
    if column_id != source_id:
        _renumber(conn, source_id, source_ids)
