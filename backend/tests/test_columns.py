import pytest
from fastapi.testclient import TestClient

from app import ai, db
from app.main import app

DEFAULT_TITLES = ["Backlog", "Discovery", "In Progress", "Review", "Done"]


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("DB_PATH", str(tmp_path / "pm.db"))
    with TestClient(app) as client:
        client.post("/api/auth/register", json={"username": "alice", "password": "secret-pass"})
        client.board = f"/api/boards/{client.get('/api/boards').json()[0]['id']}"
        yield client


def board(client):
    return client.get(client.board).json()


def titles(content):
    return [c["title"] for c in content["columns"]]


def column(content, title):
    return next(c for c in content["columns"] if c["title"] == title)


def card_titles(content, column_title):
    return [content["cards"][i]["title"] for i in column(content, column_title)["cardIds"]]


def positions(client):
    with db.transaction() as conn:
        board_id = int(client.board.rsplit("/", 1)[1])
        return [
            row["position"]
            for row in conn.execute("SELECT position FROM columns WHERE board_id = ? ORDER BY position", (board_id,))
        ]


def test_add_column_appends_an_empty_column(client):
    response = client.post(f"{client.board}/columns", json={"title": "  Blocked  "})
    assert response.status_code == 200
    content = response.json()
    assert titles(content) == [*DEFAULT_TITLES, "Blocked"]
    assert column(content, "Blocked")["cardIds"] == []
    assert positions(client) == list(range(6))


@pytest.mark.parametrize("title", ["", "  ", "x" * 201])
def test_add_column_validates_the_title(client, title):
    assert client.post(f"{client.board}/columns", json={"title": title}).status_code == 422


def test_column_limit(client):
    for i in range(db.MAX_COLUMNS - len(DEFAULT_TITLES)):
        assert client.post(f"{client.board}/columns", json={"title": f"C{i}"}).status_code == 200
    assert client.post(f"{client.board}/columns", json={"title": "One too many"}).status_code == 409
    assert len(board(client)["columns"]) == db.MAX_COLUMNS


@pytest.mark.parametrize(
    ("title", "position", "expected"),
    [
        ("Done", 0, ["Done", "Backlog", "Discovery", "In Progress", "Review"]),
        ("Backlog", 4, ["Discovery", "In Progress", "Review", "Done", "Backlog"]),
        ("Backlog", 99, ["Discovery", "In Progress", "Review", "Done", "Backlog"]),
        ("Discovery", 2, ["Backlog", "In Progress", "Discovery", "Review", "Done"]),
        ("Review", 3, DEFAULT_TITLES),
    ],
)
def test_move_column(client, title, position, expected):
    before = board(client)
    response = client.post(
        f"{client.board}/columns/{column(before, title)['id']}/move", json={"position": position}
    )
    assert response.status_code == 200
    assert titles(response.json()) == expected
    # Cards stay in their columns.
    assert all(column(response.json(), t)["cardIds"] == column(before, t)["cardIds"] for t in DEFAULT_TITLES)
    assert positions(client) == list(range(5))


def test_move_column_rejects_negative_positions(client):
    backlog = column(board(client), "Backlog")["id"]
    assert client.post(f"{client.board}/columns/{backlog}/move", json={"position": -1}).status_code == 422


def test_delete_column_with_its_cards(client):
    before = board(client)
    backlog = column(before, "Backlog")
    response = client.delete(f"{client.board}/columns/{backlog['id']}")
    assert response.status_code == 200
    content = response.json()
    assert titles(content) == DEFAULT_TITLES[1:]
    assert not set(backlog["cardIds"]) & set(content["cards"])
    assert positions(client) == list(range(4))


def test_delete_column_moving_its_cards(client):
    before = board(client)
    backlog, done = column(before, "Backlog"), column(before, "Done")
    response = client.delete(f"{client.board}/columns/{backlog['id']}", params={"moveTo": done["id"]})
    assert response.status_code == 200
    content = response.json()
    assert column(content, "Done")["cardIds"] == done["cardIds"] + backlog["cardIds"]
    assert card_titles(content, "Done") == [
        "Ship marketing page",
        "Close onboarding sprint",
        "Align roadmap themes",
        "Gather customer signals",
    ]
    with db.transaction() as conn:
        rows = conn.execute(
            "SELECT position FROM cards WHERE column_id = ? ORDER BY position", (done["id"],)
        ).fetchall()
    assert [row["position"] for row in rows] == [0, 1, 2, 3]


def test_delete_column_refusals(client):
    content = board(client)
    backlog = column(content, "Backlog")["id"]
    path = f"{client.board}/columns/{backlog}"

    assert client.delete(path, params={"moveTo": backlog}).status_code == 409
    assert client.delete(path, params={"moveTo": "col-missing"}).status_code == 404
    assert client.delete(f"{client.board}/columns/col-missing").status_code == 404
    assert board(client) == content

    for other in content["columns"][1:]:
        client.delete(f"{client.board}/columns/{other['id']}")
    assert client.delete(path).status_code == 409
    assert titles(board(client)) == ["Backlog"]


def test_columns_of_another_board_are_not_found(client):
    other_board = client.post("/api/boards", json={"title": "Other"}).json()["id"]
    other_column = client.get(f"/api/boards/{other_board}").json()["columns"][0]["id"]
    backlog = column(board(client), "Backlog")["id"]

    assert client.post(f"{client.board}/columns/{other_column}/move", json={"position": 0}).status_code == 404
    assert client.delete(f"{client.board}/columns/{other_column}").status_code == 404
    assert client.delete(f"{client.board}/columns/{backlog}", params={"moveTo": other_column}).status_code == 404


def test_new_cards_can_go_into_an_added_column(client):
    content = client.post(f"{client.board}/columns", json={"title": "Blocked"}).json()
    blocked = column(content, "Blocked")["id"]
    content = client.post(f"{client.board}/cards", json={"columnId": blocked, "title": "Stuck"}).json()
    assert card_titles(content, "Blocked") == ["Stuck"]


def test_ai_can_add_columns(client, monkeypatch):
    operations = [ai.AddColumn(type="add_column", title=" Blocked ")]
    monkeypatch.setattr(ai, "chat", lambda *args: ai.AIResponse(message="Added", operations=operations))
    content = client.post(f"{client.board}/chat", json={"message": "Add a Blocked column"}).json()["board"]
    assert titles(content) == [*DEFAULT_TITLES, "Blocked"]


def test_ai_past_the_column_limit_changes_nothing(client, monkeypatch):
    for i in range(db.MAX_COLUMNS - len(DEFAULT_TITLES) - 1):
        client.post(f"{client.board}/columns", json={"title": f"C{i}"})
    before = board(client)
    operations = [ai.AddColumn(type="add_column", title="Fits"), ai.AddColumn(type="add_column", title="Too many")]
    monkeypatch.setattr(ai, "chat", lambda *args: ai.AIResponse(message="Added", operations=operations))

    assert client.post(f"{client.board}/chat", json={"message": "Add two"}).status_code == 502
    assert board(client) == before
