import sqlite3

import pytest
from fastapi.testclient import TestClient

from app import ai, db
from app.main import app


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("DB_PATH", str(tmp_path / "pm.db"))
    with TestClient(app) as client:
        client.post("/api/auth/register", json={"username": "alice", "password": "secret-pass"})
        board_id = client.get("/api/boards").json()[0]["id"]
        client.board = f"/api/boards/{board_id}"
        client.column_id = client.get(client.board).json()["columns"][0]["id"]
        yield client


def create(client, **fields):
    response = client.post(
        f"{client.board}/cards", json={"columnId": client.column_id, "title": "Card", **fields}
    )
    return response


def new_card(response):
    board = response.json()
    return board["cards"][board["columns"][0]["cardIds"][-1]]


def test_create_card_with_all_fields(client):
    response = create(
        client,
        details="Notes",
        priority="high",
        dueDate="2026-12-24",
        labels=[" design ", "Research"],
    )
    assert response.status_code == 200
    card = new_card(response)
    assert {k: v for k, v in card.items() if k != "id"} == {
        "title": "Card",
        "details": "Notes",
        "priority": "high",
        "dueDate": "2026-12-24",
        "labels": ["design", "Research"],
        "checklist": [],
    }
    assert client.get(client.board).json()["cards"][card["id"]] == card


def test_new_card_defaults(client):
    card = new_card(create(client))
    assert (card["priority"], card["dueDate"], card["labels"]) == ("none", None, [])


def test_demo_cards_have_defaults(client):
    cards = client.get(client.board).json()["cards"].values()
    assert all(c["priority"] == "none" and c["dueDate"] is None and c["labels"] == [] for c in cards)


@pytest.mark.parametrize(
    "fields",
    [
        {"priority": "urgent"},
        {"dueDate": "2026-02-30"},
        {"dueDate": "next week"},
        {"labels": ["x" * 31]},
        {"labels": ["  "]},
        {"labels": [f"l{i}" for i in range(11)]},
    ],
    ids=["priority", "impossible date", "not a date", "long label", "blank label", "too many labels"],
)
def test_invalid_fields_are_rejected(client, fields):
    before = client.get(client.board).json()
    assert create(client, **fields).status_code == 422
    card_id = before["columns"][0]["cardIds"][0]
    assert client.patch(f"{client.board}/cards/{card_id}", json=fields).status_code == 422
    assert client.get(client.board).json() == before


def test_repeated_labels_are_dropped_ignoring_case(client):
    card = new_card(create(client, labels=["Bug", "bug", "UI", " BUG "]))
    assert card["labels"] == ["Bug", "UI"]


def test_update_changes_only_the_fields_sent(client):
    card = new_card(create(client, details="Notes", priority="low", labels=["a"]))
    path = f"{client.board}/cards/{card['id']}"

    updated = client.patch(path, json={"priority": "high"}).json()["cards"][card["id"]]
    assert updated == {**card, "priority": "high"}

    updated = client.patch(path, json={"dueDate": "2027-01-01", "labels": []}).json()["cards"][card["id"]]
    assert updated == {**card, "priority": "high", "dueDate": "2027-01-01", "labels": []}


def test_due_date_can_be_cleared(client):
    card = new_card(create(client, dueDate="2026-12-24"))
    path = f"{client.board}/cards/{card['id']}"
    updated = client.patch(path, json={"dueDate": None}).json()["cards"][card["id"]]
    assert updated["dueDate"] is None


@pytest.mark.parametrize("field", ["title", "details", "priority", "labels"])
def test_null_is_rejected_for_required_fields(client, field):
    card = new_card(create(client))
    response = client.patch(f"{client.board}/cards/{card['id']}", json={field: None})
    assert response.status_code == 422


def test_empty_update_changes_nothing(client):
    card = new_card(create(client, priority="medium"))
    response = client.patch(f"{client.board}/cards/{card['id']}", json={})
    assert response.status_code == 200
    assert response.json()["cards"][card["id"]] == card


def test_version_2_cards_get_defaults_from_migration_3(tmp_path, monkeypatch):
    monkeypatch.setenv("DB_PATH", str(tmp_path / "old.db"))
    all_migrations = db.MIGRATIONS
    monkeypatch.setattr(db, "MIGRATIONS", all_migrations[:2])
    db.init_db()
    with db.transaction() as conn:
        user_id = db.create_user(conn, "carol", "unused-hash")
        board_id = conn.execute("INSERT INTO boards (user_id, title) VALUES (?, 'B')", (user_id,)).lastrowid
        conn.execute("INSERT INTO columns VALUES ('col-a', ?, 'Todo', 0)", (board_id,))
        conn.execute("INSERT INTO cards VALUES ('card-a', 'col-a', 'Keep me', 'Details', 0)")

    monkeypatch.setattr(db, "MIGRATIONS", all_migrations)
    db.init_db()

    with db.transaction() as conn:
        assert db.get_board(conn, board_id)["cards"]["card-a"] == {
            "id": "card-a",
            "title": "Keep me",
            "details": "Details",
            "priority": "none",
            "dueDate": None,
            "labels": [],
            "checklist": [],
        }
        with pytest.raises(sqlite3.IntegrityError):
            conn.execute("UPDATE cards SET priority = 'urgent' WHERE id = 'card-a'")


def test_ai_can_set_and_replace_card_fields(client, monkeypatch):
    card = new_card(create(client, priority="low", labels=["old"]))
    operations = [
        ai.CreateCard(
            type="create_card",
            column_id=client.column_id,
            title="From AI",
            details="",
            priority="high",
            due_date="2026-12-31",
            labels=["ai", "AI"],
        ),
        ai.UpdateCard(
            type="update_card",
            card_id=card["id"],
            title="Card",
            details="",
            priority="medium",
            due_date=None,
            labels=["new"],
        ),
    ]
    monkeypatch.setattr(ai, "chat", lambda *args: ai.AIResponse(message="Done", operations=operations))

    board = client.post(f"{client.board}/chat", json={"message": "Go"}).json()["board"]

    created = board["cards"][board["columns"][0]["cardIds"][-1]]
    assert (created["title"], created["priority"], created["dueDate"], created["labels"]) == (
        "From AI",
        "high",
        "2026-12-31",
        ["ai"],
    )
    assert board["cards"][card["id"]]["priority"] == "medium"
    assert board["cards"][card["id"]]["labels"] == ["new"]


def test_ai_invalid_date_changes_nothing(client, monkeypatch):
    before = client.get(client.board).json()
    operations = [
        ai.CreateCard(
            type="create_card",
            column_id=client.column_id,
            title="Fine",
            details="",
            priority="none",
            due_date=None,
            labels=[],
        ),
        ai.CreateCard(
            type="create_card",
            column_id=client.column_id,
            title="Bad date",
            details="",
            priority="none",
            due_date="tomorrow",
            labels=[],
        ),
    ]
    monkeypatch.setattr(ai, "chat", lambda *args: ai.AIResponse(message="Done", operations=operations))

    assert client.post(f"{client.board}/chat", json={"message": "Go"}).status_code == 502
    assert client.get(client.board).json() == before
