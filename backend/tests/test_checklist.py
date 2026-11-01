import pytest
from fastapi.testclient import TestClient

from app import db
from app.main import app


@pytest.fixture
def users(tmp_path, monkeypatch):
    """alice owns a board shared with bob; carol has no access."""
    monkeypatch.setenv("DB_PATH", str(tmp_path / "pm.db"))
    clients = {}
    with TestClient(app):
        for name in ("alice", "bob", "carol"):
            client = TestClient(app)
            client.post("/api/auth/register", json={"username": name, "password": "secret-pass"})
            clients[name] = client
        board_id = clients["alice"].get("/api/boards").json()[0]["id"]
        clients["alice"].post(f"/api/boards/{board_id}/members", json={"username": "bob"})
        path = f"/api/boards/{board_id}"
        card_id = clients["alice"].get(path).json()["columns"][0]["cardIds"][0]
        clients["card_id"] = card_id
        clients["card"] = f"{path}/cards/{card_id}"
        clients["path"] = path
        yield clients


def add(client, card, text):
    return client.post(f"{card}/checklist", json={"text": text})


def checklist(response, card_id):
    return [(item["text"], item["done"]) for item in response.json()["cards"][card_id]["checklist"]]


def item_ids(client, users):
    content = client.get(users["path"]).json()
    return [item["id"] for item in content["cards"][users["card_id"]]["checklist"]]


def test_cards_start_with_an_empty_checklist(users):
    cards = users["alice"].get(users["path"]).json()["cards"].values()
    assert all(card["checklist"] == [] for card in cards)


def test_add_items_in_order(users):
    alice, card = users["alice"], users["card"]
    add(alice, card, "  Draft  ")
    response = add(alice, card, "Review")
    assert response.status_code == 200
    assert checklist(response, users["card_id"]) == [("Draft", False), ("Review", False)]
    assert all(i.startswith("item-") for i in item_ids(alice, users))


@pytest.mark.parametrize("text", ["", "   ", "x" * 201])
def test_invalid_item_text_is_rejected(users, text):
    assert add(users["alice"], users["card"], text).status_code == 422


def test_item_limit(users, monkeypatch):
    monkeypatch.setattr(db, "MAX_CHECKLIST_ITEMS", 2)
    alice, card = users["alice"], users["card"]
    add(alice, card, "One")
    add(alice, card, "Two")
    assert add(alice, card, "Three").status_code == 409


def test_check_rename_and_uncheck(users):
    alice, card = users["alice"], users["card"]
    add(alice, card, "Draft")
    add(alice, card, "Review")
    first, second = item_ids(alice, users)

    response = alice.patch(f"{card}/checklist/{first}", json={"done": True})
    assert checklist(response, users["card_id"]) == [("Draft", True), ("Review", False)]
    response = alice.patch(f"{card}/checklist/{second}", json={"text": " Final review "})
    assert checklist(response, users["card_id"]) == [("Draft", True), ("Final review", False)]
    response = alice.patch(f"{card}/checklist/{first}", json={"done": False, "text": "Redraft"})
    assert checklist(response, users["card_id"]) == [("Redraft", False), ("Final review", False)]
    response = alice.patch(f"{card}/checklist/{first}", json={})
    assert checklist(response, users["card_id"]) == [("Redraft", False), ("Final review", False)]


@pytest.mark.parametrize("body", [{"done": None}, {"text": None}, {"text": "  "}, {"done": "maybe"}])
def test_invalid_item_updates_are_rejected(users, body):
    add(users["alice"], users["card"], "Draft")
    [item] = item_ids(users["alice"], users)
    assert users["alice"].patch(f"{users['card']}/checklist/{item}", json=body).status_code == 422


def test_delete_item_keeps_the_order(users):
    alice, card = users["alice"], users["card"]
    for text in ("A", "B", "C"):
        add(alice, card, text)
    a, b, c = item_ids(alice, users)
    response = alice.delete(f"{card}/checklist/{b}")
    assert checklist(response, users["card_id"]) == [("A", False), ("C", False)]
    add(alice, card, "D")
    with db.transaction() as conn:
        positions = conn.execute(
            "SELECT position FROM checklist_items WHERE card_id = ? ORDER BY position", (users["card_id"],)
        ).fetchall()
    assert [row["position"] for row in positions] == [0, 1, 2]


def test_checklist_changes_are_logged(users):
    alice, card = users["alice"], users["card"]
    add(alice, card, "Draft")
    [item] = item_ids(alice, users)
    alice.patch(f"{card}/checklist/{item}", json={"done": True})
    alice.patch(f"{card}/checklist/{item}", json={"done": False})
    alice.patch(f"{card}/checklist/{item}", json={"text": "Redraft"})
    alice.patch(f"{card}/checklist/{item}", json={})
    alice.delete(f"{card}/checklist/{item}")
    messages = [entry["message"] for entry in alice.get(f"{users['path']}/activity").json()]
    assert messages[:5] == [
        'removed "Redraft" from the checklist of "Align roadmap themes"',
        'edited the checklist of "Align roadmap themes"',
        'unchecked "Draft" on "Align roadmap themes"',
        'checked "Draft" on "Align roadmap themes"',
        'added "Draft" to the checklist of "Align roadmap themes"',
    ]


def test_members_can_use_checklists_and_outsiders_cannot(users):
    card = users["card"]
    assert add(users["bob"], card, "From bob").status_code == 200
    [item] = item_ids(users["alice"], users)
    assert users["carol"].post(f"{card}/checklist", json={"text": "Hi"}).status_code == 404
    assert users["carol"].patch(f"{card}/checklist/{item}", json={"done": True}).status_code == 404
    assert users["carol"].delete(f"{card}/checklist/{item}").status_code == 404


def test_items_are_checked_against_their_card(users):
    alice, card, path = users["alice"], users["card"], users["path"]
    add(alice, card, "Draft")
    [item] = item_ids(alice, users)
    other_card = alice.get(path).json()["columns"][0]["cardIds"][1]

    assert alice.patch(f"{path}/cards/{other_card}/checklist/{item}", json={"done": True}).status_code == 404
    assert alice.delete(f"{path}/cards/{other_card}/checklist/{item}").status_code == 404
    assert alice.patch(f"{card}/checklist/item-missing", json={"done": True}).status_code == 404
    assert add(alice, f"{path}/cards/card-missing", "Hi").status_code == 404


def test_deleting_a_card_deletes_its_checklist(users):
    add(users["alice"], users["card"], "Draft")
    users["alice"].delete(users["card"])
    with db.transaction() as conn:
        assert not conn.execute("SELECT 1 FROM checklist_items").fetchone()


def test_version_5_database_gets_checklists(tmp_path, monkeypatch):
    monkeypatch.setenv("DB_PATH", str(tmp_path / "old.db"))
    all_migrations = db.MIGRATIONS
    monkeypatch.setattr(db, "MIGRATIONS", all_migrations[:5])
    db.init_db()
    with db.transaction() as conn:
        user_id = db.create_user(conn, "dave", "unused-hash")
        board_id = db.create_board(conn, user_id, "Old", demo_cards=True)
        # Plain SQL: today's get_board already reads the checklist table.
        before = conn.execute("SELECT * FROM cards ORDER BY id").fetchall()

    monkeypatch.setattr(db, "MIGRATIONS", all_migrations)
    db.init_db()

    with db.transaction() as conn:
        assert conn.execute("SELECT * FROM cards ORDER BY id").fetchall() == before
        cards = db.get_board(conn, board_id)["cards"].values()
    assert len(cards) == 8
    assert all(card["checklist"] == [] for card in cards)
