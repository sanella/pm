import pytest
from fastapi.testclient import TestClient

from app import ai, db
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
        clients["path"] = f"/api/boards/{board_id}"
        yield clients


def messages(client, path):
    return [(entry["author"], entry["message"]) for entry in client.get(f"{path}/activity").json()]


def board(client, path):
    return client.get(path).json()


def column(content, title):
    return next(c for c in content["columns"] if c["title"] == title)


def test_sharing_is_logged(users):
    assert messages(users["alice"], users["path"]) == [("alice", "added bob to the board")]


def test_card_and_column_changes_are_logged_newest_first(users):
    alice, path = users["alice"], users["path"]
    content = board(alice, path)
    backlog, done = column(content, "Backlog"), column(content, "Done")
    first, second = backlog["cardIds"]

    alice.post(f"{path}/cards", json={"columnId": backlog["id"], "title": "New"})
    alice.patch(f"{path}/cards/{first}", json={"title": "Renamed card"})
    alice.post(f"{path}/cards/{first}/move", json={"columnId": done["id"], "position": 0})
    alice.post(f"{path}/cards/{second}/move", json={"columnId": backlog["id"], "position": 5})
    alice.delete(f"{path}/cards/{second}")
    alice.patch(f"{path}/columns/{backlog['id']}", json={"title": "Ideas"})
    alice.post(f"{path}/columns", json={"title": "Blocked"})
    alice.post(f"{path}/columns/{done['id']}/move", json={"position": 0})
    alice.delete(f"{path}/columns/{backlog['id']}", params={"moveTo": done["id"]})
    review = column(board(alice, path), "Review")["id"]
    alice.delete(f"{path}/columns/{review}")
    alice.patch(path, json={"title": "Roadmap"})

    assert [message for _, message in messages(alice, path)] == [
        'renamed the board "My board" to "Roadmap"',
        'deleted column "Review"',
        'deleted column "Ideas", moving its cards to "Done"',
        'moved column "Done"',
        'added column "Blocked"',
        'renamed column "Backlog" to "Ideas"',
        'deleted card "Gather customer signals"',
        'reordered card "Gather customer signals" in "Backlog"',
        'moved card "Renamed card" to "Done"',
        'edited card "Renamed card"',
        'added card "New" to "Backlog"',
        "added bob to the board",
    ]


def test_each_entry_names_who_did_it(users):
    path = users["path"]
    column_id = board(users["bob"], path)["columns"][0]["id"]
    users["bob"].post(f"{path}/cards", json={"columnId": column_id, "title": "From bob"})
    entry = users["alice"].get(f"{path}/activity").json()[0]
    assert (entry["author"], entry["message"]) == ("bob", 'added card "From bob" to "Backlog"')
    assert entry["createdAt"].endswith("+00:00")


def test_reads_empty_edits_and_failures_are_not_logged(users):
    alice, path = users["alice"], users["path"]
    card_id = board(alice, path)["columns"][0]["cardIds"][0]
    before = messages(alice, path)

    board(alice, path)
    alice.patch(f"{path}/cards/{card_id}", json={})
    assert alice.post(f"{path}/cards/{card_id}/move", json={"columnId": "col-missing", "position": 0}).status_code == 404
    assert alice.post(f"{path}/columns", json={"title": "  "}).status_code == 422

    assert messages(alice, path) == before


def test_ai_changes_are_logged_as_such(users, monkeypatch):
    alice, path = users["alice"], users["path"]
    operations = [ai.AddColumn(type="add_column", title="Blocked")]
    monkeypatch.setattr(ai, "chat", lambda *args: ai.AIResponse(message="Done", operations=operations))
    alice.post(f"{path}/chat", json={"message": "Add a Blocked column"})
    assert messages(alice, path)[0] == ("alice", 'added column "Blocked" (via the AI assistant)')


def test_member_changes_are_logged(users):
    path = users["path"]
    users["alice"].post(f"{path}/members", json={"username": "carol"})
    users["alice"].delete(f"{path}/members/carol")
    users["bob"].delete(f"{path}/members/bob")
    assert messages(users["alice"], path)[:3] == [
        ("bob", "left the board"),
        ("alice", "removed carol from the board"),
        ("alice", "added carol to the board"),
    ]


def test_activity_is_capped(users, monkeypatch):
    monkeypatch.setattr(db, "ACTIVITY_LIMIT", 3)
    alice, path = users["alice"], users["path"]
    for title in ("A", "B", "C", "D"):
        alice.post(f"{path}/columns", json={"title": title})
    assert [m for _, m in messages(alice, path)] == [
        'added column "D"',
        'added column "C"',
        'added column "B"',
    ]


def test_only_people_with_access_see_activity(users):
    assert users["bob"].get(f"{users['path']}/activity").status_code == 200
    assert users["carol"].get(f"{users['path']}/activity").status_code == 404


# Comments


def card_path(client, path):
    return f"{path}/cards/{board(client, path)['columns'][0]['cardIds'][0]}"


def comments(client, card):
    return [(c["author"], c["text"], c["mine"]) for c in client.get(f"{card}/comments").json()]


def test_comments_are_listed_oldest_first_with_their_authors(users):
    card = card_path(users["alice"], users["path"])
    assert users["alice"].get(f"{card}/comments").json() == []

    response = users["alice"].post(f"{card}/comments", json={"text": "  First  "})
    assert response.status_code == 200
    users["bob"].post(f"{card}/comments", json={"text": "Second"})

    assert comments(users["alice"], card) == [("alice", "First", True), ("bob", "Second", False)]
    assert comments(users["bob"], card) == [("alice", "First", False), ("bob", "Second", True)]
    assert messages(users["alice"], users["path"])[0] == ("bob", 'commented on "Align roadmap themes"')


@pytest.mark.parametrize("text", ["", "   ", "x" * 2001])
def test_invalid_comments_are_rejected(users, text):
    card = card_path(users["alice"], users["path"])
    assert users["alice"].post(f"{card}/comments", json={"text": text}).status_code == 422


def test_only_the_author_deletes_a_comment(users):
    alice, bob = users["alice"], users["bob"]
    card = card_path(alice, users["path"])
    comment_id = alice.post(f"{card}/comments", json={"text": "Mine"}).json()[0]["id"]

    assert bob.delete(f"{card}/comments/{comment_id}").status_code == 403
    assert alice.delete(f"{card}/comments/comment-missing").status_code == 404
    response = alice.delete(f"{card}/comments/{comment_id}")
    assert response.status_code == 200
    assert response.json() == []


def test_comments_are_checked_against_the_board(users):
    alice, path = users["alice"], users["path"]
    card = card_path(alice, path)
    comment_id = alice.post(f"{card}/comments", json={"text": "Here"}).json()[0]["id"]
    other_card = f"{path}/cards/{board(alice, path)['columns'][0]['cardIds'][1]}"
    other_board = alice.post("/api/boards", json={"title": "Other"}).json()["id"]
    card_id = card.rsplit("/", 1)[1]

    assert alice.get(f"{path}/cards/card-missing/comments").status_code == 404
    assert alice.get(f"/api/boards/{other_board}/cards/{card_id}/comments").status_code == 404
    assert alice.delete(f"{other_card}/comments/{comment_id}").status_code == 404
    assert users["carol"].get(f"{card}/comments").status_code == 404
    assert users["carol"].post(f"{card}/comments", json={"text": "Hi"}).status_code == 404


def test_deleting_a_card_deletes_its_comments(users):
    alice = users["alice"]
    card = card_path(alice, users["path"])
    alice.post(f"{card}/comments", json={"text": "Gone soon"})
    alice.delete(card)
    with db.transaction() as conn:
        assert not conn.execute("SELECT 1 FROM comments").fetchone()


def test_a_deleted_authors_comments_and_activity_stay_without_a_name(users):
    path = users["path"]
    card = card_path(users["alice"], path)
    users["bob"].post(f"{card}/comments", json={"text": "From bob"})
    users["bob"].post("/api/auth/delete-account", json={"password": "secret-pass"})

    assert comments(users["alice"], card) == [(None, "From bob", False)]
    assert messages(users["alice"], path)[0] == (None, 'commented on "Align roadmap themes"')
