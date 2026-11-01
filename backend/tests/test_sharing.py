import pytest
from fastapi.testclient import TestClient

from app import ai
from app.main import app


@pytest.fixture
def users(tmp_path, monkeypatch):
    """alice owns a shared board, bob is a member, carol is not."""
    monkeypatch.setenv("DB_PATH", str(tmp_path / "pm.db"))
    clients = {}
    with TestClient(app):
        for name in ("alice", "bob", "carol"):
            client = TestClient(app)
            client.post("/api/auth/register", json={"username": name, "password": "secret-pass"})
            clients[name] = client
        alice = clients["alice"]
        board_id = alice.post("/api/boards", json={"title": "Launch"}).json()["id"]
        assert alice.post(f"/api/boards/{board_id}/members", json={"username": "bob"}).status_code == 200
        clients["board"] = f"/api/boards/{board_id}"
        clients["board_id"] = board_id
        yield clients


def titles(client):
    return [(b["title"], b["owner"], b["isOwner"]) for b in client.get("/api/boards").json()]


def first_column(client, path):
    return client.get(path).json()["columns"][0]["id"]


def test_shared_board_is_listed_with_its_owner(users):
    assert titles(users["bob"]) == [("My board", "bob", True), ("Launch", "alice", False)]
    assert titles(users["alice"]) == [("My board", "alice", True), ("Launch", "alice", True)]
    assert titles(users["carol"]) == [("My board", "carol", True)]


def test_members_are_listed(users):
    expected = {"owner": "alice", "members": ["bob"]}
    assert users["alice"].get(f"{users['board']}/members").json() == expected
    assert users["bob"].get(f"{users['board']}/members").json() == expected


def test_member_can_work_on_the_board(users, monkeypatch):
    bob, path = users["bob"], users["board"]
    column_id = first_column(bob, path)

    board = bob.post(f"{path}/cards", json={"columnId": column_id, "title": "From bob"}).json()
    card_id = board["columns"][0]["cardIds"][0]
    assert bob.patch(f"{path}/cards/{card_id}", json={"priority": "high"}).status_code == 200
    assert bob.patch(f"{path}/columns/{column_id}", json={"title": "Ideas"}).status_code == 200
    assert bob.post(f"{path}/columns", json={"title": "Blocked"}).status_code == 200
    monkeypatch.setattr(ai, "chat", lambda *args: ai.AIResponse(message="Hi", operations=[]))
    assert bob.post(f"{path}/chat", json={"message": "Hello"}).status_code == 200

    # The owner sees the member's changes.
    seen = users["alice"].get(path).json()
    assert seen["cards"][card_id]["priority"] == "high"
    assert [c["title"] for c in seen["columns"]][0] == "Ideas"


def test_member_cannot_do_owner_actions(users):
    bob, path = users["bob"], users["board"]
    assert bob.patch(path, json={"title": "Mine now"}).status_code == 403
    assert bob.delete(path).status_code == 403
    assert bob.post(f"{path}/members", json={"username": "carol"}).status_code == 403
    users["alice"].post(f"{path}/members", json={"username": "carol"})
    assert bob.delete(f"{path}/members/carol").status_code == 403
    assert users["alice"].get(f"{path}/members").json()["members"] == ["bob", "carol"]
    assert titles(users["alice"])[1] == ("Launch", "alice", True)


def test_outsider_cannot_see_the_board(users):
    carol, path = users["carol"], users["board"]
    for method, url, body in [
        ("get", path, None),
        ("get", f"{path}/members", None),
        ("post", f"{path}/members", {"username": "carol"}),
        ("delete", f"{path}/members/bob", None),
        ("delete", f"{path}/members/carol", None),
        ("patch", path, {"title": "T"}),
        ("post", f"{path}/columns", {"title": "T"}),
        ("post", f"{path}/chat", {"message": "Hi"}),
    ]:
        kwargs = {"json": body} if body is not None else {}
        assert carol.request(method, url, **kwargs).status_code == 404, (method, url)


def test_member_can_leave(users):
    bob, path = users["bob"], users["board"]
    response = bob.delete(f"{path}/members/bob")
    assert response.status_code == 200
    assert response.json() == {"owner": "alice", "members": []}
    assert bob.get(path).status_code == 404
    assert titles(bob) == [("My board", "bob", True)]


def test_owner_can_remove_a_member(users):
    path = users["board"]
    assert users["alice"].delete(f"{path}/members/bob").status_code == 200
    assert users["bob"].get(path).status_code == 404


@pytest.mark.parametrize(
    ("username", "status"),
    [("nobody", 404), ("alice", 409), ("bob", 409), ("  ", 422)],
    ids=["unknown user", "the owner", "already a member", "blank"],
)
def test_adding_members_is_checked(users, username, status):
    response = users["alice"].post(f"{users['board']}/members", json={"username": username})
    assert response.status_code == status
    assert users["alice"].get(f"{users['board']}/members").json()["members"] == ["bob"]


def test_removing_someone_who_is_not_a_member(users):
    assert users["alice"].delete(f"{users['board']}/members/carol").status_code == 404
    assert users["alice"].delete(f"{users['board']}/members/alice").status_code == 404


def test_deleting_the_board_removes_it_for_members(users):
    assert users["alice"].delete(users["board"]).status_code == 200
    assert titles(users["bob"]) == [("My board", "bob", True)]


def test_deleting_the_owner_removes_the_board_for_members(users):
    users["alice"].post("/api/auth/delete-account", json={"password": "secret-pass"})
    assert users["bob"].get(users["board"]).status_code == 404
    assert titles(users["bob"]) == [("My board", "bob", True)]


def test_deleting_a_member_account_removes_the_membership(users):
    users["bob"].post("/api/auth/delete-account", json={"password": "secret-pass"})
    assert users["alice"].get(f"{users['board']}/members").json()["members"] == []


def test_shared_boards_do_not_count_as_own_boards(users):
    bob = users["bob"]
    own = titles(bob)[0]
    own_id = bob.get("/api/boards").json()[0]["id"]
    assert own == ("My board", "bob", True)
    # bob's only own board cannot be deleted, even though he can open another.
    assert bob.delete(f"/api/boards/{own_id}").status_code == 409


def test_sharing_ignores_username_case(users):
    path = users["board"]
    alice = users["alice"]
    alice.delete(f"{path}/members/BOB")
    assert alice.get(f"{path}/members").json()["members"] == []
    assert alice.post(f"{path}/members", json={"username": "Carol"}).status_code == 200
    assert alice.get(f"{path}/members").json()["members"] == ["carol"]
    # A member leaves under any spelling of their own name.
    assert users["carol"].delete(f"{path}/members/CAROL").status_code == 200
    assert users["carol"].get(path).status_code == 404
