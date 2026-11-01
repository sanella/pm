import sqlite3
from contextlib import closing, contextmanager

import pytest
from fastapi.testclient import TestClient

from app import auth, db
from app.main import app


@pytest.fixture
def db_file(tmp_path, monkeypatch):
    path = tmp_path / "pm.db"
    monkeypatch.setenv("DB_PATH", str(path))
    return path


@pytest.fixture
def client(db_file):
    with TestClient(app) as client:
        yield client


def register(client, username="alice", password="secret-pass"):
    return client.post("/api/auth/register", json={"username": username, "password": password})


def login(client, username="alice", password="secret-pass"):
    return client.post("/api/auth/login", json={"username": username, "password": password})


def board_path(client):
    return f"/api/boards/{client.get('/api/boards').json()[0]['id']}"


def version(path):
    with closing(sqlite3.connect(path)) as conn:
        return conn.execute("PRAGMA user_version").fetchone()[0]


# Migrations


def test_fresh_db_is_fully_migrated(db_file):
    db.init_db()
    assert version(db_file) == len(db.MIGRATIONS)
    with db.transaction() as conn:
        columns = {row["name"] for row in conn.execute("PRAGMA table_info(users)")}
    assert "password_hash" in columns


def test_init_db_is_idempotent(db_file):
    db.init_db()
    db.init_db()
    assert version(db_file) == len(db.MIGRATIONS)


def test_version_0_db_is_upgraded_and_keeps_its_data(db_file):
    # A database as the MVP created it: original schema, version 0, a board with cards.
    with closing(sqlite3.connect(db_file)) as conn:
        conn.executescript(db.SCHEMA)
        conn.execute("INSERT INTO users (id, username) VALUES (1, 'user')")
        conn.execute("INSERT INTO boards (id, user_id) VALUES (1, 1)")
        conn.execute("INSERT INTO columns VALUES ('col-a', 1, 'Todo', 0)")
        conn.execute("INSERT INTO cards VALUES ('card-a', 'col-a', 'Keep me', 'Details', 0)")
        conn.commit()

    with TestClient(app) as client:
        assert version(db_file) == len(db.MIGRATIONS)
        # The legacy demo row gets the demo password, and its board is untouched.
        assert login(client, "user", "password").status_code == 200
        board = client.get(board_path(client)).json()
    assert board["cards"]["card-a"]["title"] == "Keep me"
    assert board["columns"] == [{"id": "col-a", "title": "Todo", "cardIds": ["card-a"]}]


def test_failed_migration_rolls_back(db_file, monkeypatch):
    db.init_db()
    before = version(db_file)
    monkeypatch.setattr(
        db, "MIGRATIONS", [*db.MIGRATIONS, "CREATE TABLE half (id INTEGER); SELECT * FROM missing"]
    )
    with pytest.raises(sqlite3.OperationalError):
        db.init_db()
    assert version(db_file) == before
    with db.transaction() as conn:
        assert not conn.execute("SELECT 1 FROM sqlite_master WHERE name = 'half'").fetchone()


# Password hashing


def test_password_hash_round_trip():
    password_hash = auth.hash_password("correct horse")
    assert password_hash.startswith("scrypt$")
    assert "correct horse" not in password_hash
    assert auth.verify_password("correct horse", password_hash)
    assert not auth.verify_password("wrong horse", password_hash)


def test_hashes_are_salted():
    assert auth.hash_password("same") != auth.hash_password("same")


def test_missing_hash_never_verifies():
    assert not auth.verify_password("", None)


# Demo account


def test_demo_account_exists_on_a_fresh_db(client):
    assert login(client, "user", "password").json() == {"username": "user"}


def test_changed_demo_password_survives_restart(client):
    login(client, "user", "password")
    client.post("/api/auth/password", json={"currentPassword": "password", "newPassword": "new-password"})
    with TestClient(app) as restarted:
        assert login(restarted, "user", "password").status_code == 401
        assert login(restarted, "user", "new-password").status_code == 200


# Register


def test_register_signs_in(client):
    response = register(client)
    assert response.status_code == 201
    assert response.json() == {"username": "alice"}
    assert client.get("/api/auth/me").json() == {"username": "alice"}


def test_registered_user_can_log_in_again(client):
    register(client)
    client.post("/api/auth/logout")
    assert client.get("/api/auth/me").status_code == 401
    assert login(client).status_code == 200


def test_duplicate_username_is_rejected(client):
    register(client)
    response = register(client, password="other-pass")
    assert response.status_code == 409
    assert login(client, password="other-pass").status_code == 401


@pytest.mark.parametrize(
    ("username", "password"),
    [("ab", "long-enough"), ("has space", "long-enough"), ("x" * 33, "long-enough"), ("bob", "short")],
)
def test_invalid_registration_is_rejected(client, username, password):
    assert register(client, username, password).status_code == 422
    assert client.get("/api/auth/me").status_code == 401


def test_new_user_gets_their_own_board(client):
    login(client, "user", "password")
    client.patch(
        f"{board_path(client)}/columns/{client.get(board_path(client)).json()['columns'][0]['id']}",
        json={"title": "Demo only"},
    )
    client.post("/api/auth/logout")

    register(client)
    board = client.get(board_path(client)).json()
    assert board["columns"][0]["title"] == "Backlog"
    assert len(board["cards"]) == 8


# Change password


def test_change_password(client):
    register(client)
    response = client.post(
        "/api/auth/password", json={"currentPassword": "secret-pass", "newPassword": "brand-new-pass"}
    )
    assert response.status_code == 200
    client.post("/api/auth/logout")
    assert login(client).status_code == 401
    assert login(client, password="brand-new-pass").status_code == 200


def test_change_password_needs_the_current_password(client):
    register(client)
    response = client.post(
        "/api/auth/password", json={"currentPassword": "wrong-pass", "newPassword": "brand-new-pass"}
    )
    assert response.status_code == 403
    client.post("/api/auth/logout")
    assert login(client).status_code == 200


def test_new_password_is_validated(client):
    register(client)
    response = client.post(
        "/api/auth/password", json={"currentPassword": "secret-pass", "newPassword": "short"}
    )
    assert response.status_code == 422


def test_change_password_requires_session(client):
    response = client.post("/api/auth/password", json={"currentPassword": "a", "newPassword": "b" * 8})
    assert response.status_code == 401


# Delete account


def test_delete_account_removes_user_and_board(client):
    register(client)
    board = client.get(board_path(client)).json()

    response = client.post("/api/auth/delete-account", json={"password": "secret-pass"})

    assert response.status_code == 200
    assert client.get("/api/auth/me").status_code == 401
    assert login(client).status_code == 401
    with db.transaction() as conn:
        assert not conn.execute(
            f"SELECT 1 FROM cards WHERE id IN ({','.join('?' * len(board['cards']))})",
            list(board["cards"]),
        ).fetchone()
    # The name is free again.
    assert register(client).status_code == 201


def test_delete_account_needs_the_password(client):
    register(client)
    assert client.post("/api/auth/delete-account", json={"password": "wrong"}).status_code == 403
    assert client.get("/api/auth/me").status_code == 200


def test_session_of_a_deleted_user_is_rejected(client):
    register(client)
    with db.transaction() as conn:
        db.delete_user(conn, db.get_user(conn, "alice")["id"])
    assert client.get("/api/auth/me").status_code == 401
    assert client.get("/api/boards").status_code == 401


def test_migration_breaking_a_foreign_key_is_rolled_back(db_file, monkeypatch):
    db.init_db()
    before = version(db_file)
    # Foreign keys are off during migrations, so only the check catches this.
    monkeypatch.setattr(
        db,
        "MIGRATIONS",
        [*db.MIGRATIONS, "INSERT INTO cards (id, column_id, title, position) VALUES ('card-x', 'col-none', 'Orphan', 0)"],
    )
    with pytest.raises(sqlite3.IntegrityError, match="broke a foreign key"):
        db.init_db()
    assert version(db_file) == before
    with db.transaction() as conn:
        assert not conn.execute("SELECT 1 FROM cards WHERE id = 'card-x'").fetchone()


@pytest.mark.parametrize(
    ("path", "body"),
    [
        ("/api/auth/login", {"username": "alice", "password": "x" * 129}),
        ("/api/auth/login", {"username": "x" * 33, "password": "secret-pass"}),
        ("/api/auth/password", {"currentPassword": "x" * 129, "newPassword": "brand-new-pass"}),
        ("/api/auth/delete-account", {"password": "x" * 129}),
    ],
)
def test_oversized_credentials_are_rejected_before_hashing(client, monkeypatch, path, body):
    register(client)
    hashed = []
    monkeypatch.setattr(auth, "verify_password", lambda *args: hashed.append(args) or False)
    assert client.post(path, json=body).status_code == 422
    assert hashed == []


def test_usernames_ignore_case(client):
    register(client, "Alice")
    assert register(client, "alice", "other-pass").status_code == 409
    client.post("/api/auth/logout")
    response = login(client, "ALICE")
    assert response.status_code == 200
    # The name keeps the spelling it was registered with.
    assert response.json() == {"username": "Alice"}


def test_migration_7_refuses_names_that_differ_only_in_case(db_file, monkeypatch):
    all_migrations = db.MIGRATIONS
    monkeypatch.setattr(db, "MIGRATIONS", all_migrations[:6])
    db.init_db()
    with db.transaction() as conn:
        db.create_user(conn, "bob", "unused-hash")
        db.create_user(conn, "Bob", "unused-hash")

    monkeypatch.setattr(db, "MIGRATIONS", all_migrations)
    with pytest.raises(sqlite3.IntegrityError):
        db.init_db()
    assert version(db_file) == 6


def test_password_hashing_never_holds_the_write_lock(client, monkeypatch):
    """scrypt is slow; it must not run inside a transaction (which blocks every other write)."""
    open_transactions = []
    real_transaction = db.transaction

    @contextmanager
    def tracked_transaction():
        open_transactions.append(1)
        try:
            with real_transaction() as conn:
                yield conn
        finally:
            open_transactions.pop()

    def checked(real):
        def wrapper(*args):
            assert not open_transactions, f"{real.__name__} ran inside a transaction"
            return real(*args)

        return wrapper

    monkeypatch.setattr(db, "transaction", tracked_transaction)
    monkeypatch.setattr(auth, "hash_password", checked(auth.hash_password))
    monkeypatch.setattr(auth, "verify_password", checked(auth.verify_password))

    assert register(client).status_code == 201
    assert login(client).status_code == 200
    change = {"currentPassword": "secret-pass", "newPassword": "brand-new-pass"}
    assert client.post("/api/auth/password", json=change).status_code == 200
    assert client.post("/api/auth/delete-account", json={"password": "brand-new-pass"}).status_code == 200
