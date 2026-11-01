from concurrent.futures import ThreadPoolExecutor

import pytest
from fastapi.testclient import TestClient

from app import db
from app.main import app

DEFAULT_TITLES = ["Backlog", "Discovery", "In Progress", "Review", "Done"]


@pytest.fixture
def db_file(tmp_path, monkeypatch):
    path = tmp_path / "nested" / "pm.db"
    monkeypatch.setenv("DB_PATH", str(path))
    return path


@pytest.fixture
def client(db_file):
    with TestClient(app) as client:
        client.post("/api/auth/login", json={"username": "user", "password": "password"})
        yield client


def column(board, title):
    return next(c for c in board["columns"] if c["title"] == title)


def card_titles(board, column_title):
    return [board["cards"][card_id]["title"] for card_id in column(board, column_title)["cardIds"]]


def test_db_created_on_startup(db_file):
    assert not db_file.exists()
    with TestClient(app):
        pass
    assert db_file.exists()


def test_new_user_gets_seeded_board(client):
    response = client.get("/api/board")
    assert response.status_code == 200
    board = response.json()
    assert [c["title"] for c in board["columns"]] == DEFAULT_TITLES
    assert len(board["cards"]) == 8
    assert card_titles(board, "Backlog") == ["Align roadmap themes", "Gather customer signals"]
    assert all(c["id"].startswith("col-") for c in board["columns"])
    assert all(card_id.startswith("card-") for card_id in board["cards"])


def test_board_is_stable_across_requests(client):
    assert client.get("/api/board").json() == client.get("/api/board").json()


def test_rename_column(client):
    backlog = column(client.get("/api/board").json(), "Backlog")
    response = client.patch(f"/api/columns/{backlog['id']}", json={"title": "Ideas"})
    assert response.status_code == 200
    assert response.json()["columns"][0] == {**backlog, "title": "Ideas"}


def test_create_card_appends_to_column(client):
    review = column(client.get("/api/board").json(), "Review")
    response = client.post(
        "/api/cards", json={"columnId": review["id"], "title": "New", "details": "Notes"}
    )
    assert response.status_code == 200
    board = response.json()
    assert card_titles(board, "Review") == ["QA micro-interactions", "New"]
    new_id = column(board, "Review")["cardIds"][-1]
    assert board["cards"][new_id] == {"id": new_id, "title": "New", "details": "Notes"}


def test_update_card(client):
    board = client.get("/api/board").json()
    card_id = column(board, "Backlog")["cardIds"][0]
    response = client.patch(f"/api/cards/{card_id}", json={"title": "Edited", "details": "D"})
    assert response.status_code == 200
    assert response.json()["cards"][card_id] == {"id": card_id, "title": "Edited", "details": "D"}


def test_delete_card_renumbers_column(client):
    board = client.get("/api/board").json()
    first, second = column(board, "Backlog")["cardIds"]
    board = client.delete(f"/api/cards/{first}").json()
    assert first not in board["cards"]
    assert column(board, "Backlog")["cardIds"] == [second]

    # A new card lands after the remaining one, proving positions were renumbered.
    backlog_id = column(board, "Backlog")["id"]
    board = client.post("/api/cards", json={"columnId": backlog_id, "title": "Last"}).json()
    assert card_titles(board, "Backlog") == ["Gather customer signals", "Last"]


def test_move_card_within_column(client):
    board = client.get("/api/board").json()
    progress = column(board, "In Progress")
    first, second = progress["cardIds"]
    board = client.post(
        f"/api/cards/{first}/move", json={"columnId": progress["id"], "position": 1}
    ).json()
    assert column(board, "In Progress")["cardIds"] == [second, first]


def test_move_card_across_columns(client):
    board = client.get("/api/board").json()
    card_id = column(board, "Backlog")["cardIds"][0]
    done = column(board, "Done")
    board = client.post(
        f"/api/cards/{card_id}/move", json={"columnId": done["id"], "position": 1}
    ).json()
    assert card_titles(board, "Done") == [
        "Ship marketing page",
        "Align roadmap themes",
        "Close onboarding sprint",
    ]
    assert card_titles(board, "Backlog") == ["Gather customer signals"]


def test_move_card_position_is_clamped(client):
    board = client.get("/api/board").json()
    card_id = column(board, "Backlog")["cardIds"][0]
    review = column(board, "Review")
    board = client.post(
        f"/api/cards/{card_id}/move", json={"columnId": review["id"], "position": 99}
    ).json()
    assert card_titles(board, "Review") == ["QA micro-interactions", "Align roadmap themes"]


def test_move_to_empty_column(client):
    board = client.get("/api/board").json()
    discovery = column(board, "Discovery")
    only_card = discovery["cardIds"][0]
    board = client.post(
        f"/api/cards/{only_card}/move", json={"columnId": column(board, "Done")["id"], "position": 0}
    ).json()
    assert column(board, "Discovery")["cardIds"] == []
    card_id = column(board, "Backlog")["cardIds"][0]
    board = client.post(
        f"/api/cards/{card_id}/move", json={"columnId": discovery["id"], "position": 0}
    ).json()
    assert column(board, "Discovery")["cardIds"] == [card_id]


@pytest.mark.parametrize(
    ("method", "path", "body"),
    [
        ("get", "/api/board", None),
        ("patch", "/api/columns/col-x", {"title": "T"}),
        ("post", "/api/cards", {"columnId": "col-x", "title": "T"}),
        ("patch", "/api/cards/card-x", {"title": "T"}),
        ("delete", "/api/cards/card-x", None),
        ("post", "/api/cards/card-x/move", {"columnId": "col-x", "position": 0}),
    ],
)
def test_requires_session(db_file, method, path, body):
    with TestClient(app) as client:
        kwargs = {"json": body} if body is not None else {}
        assert client.request(method, path, **kwargs).status_code == 401


def test_unknown_ids_return_404(client):
    board = client.get("/api/board").json()
    column_id = board["columns"][0]["id"]
    card_id = board["columns"][0]["cardIds"][0]
    assert client.patch("/api/columns/col-missing", json={"title": "T"}).status_code == 404
    assert client.post("/api/cards", json={"columnId": "col-missing", "title": "T"}).status_code == 404
    assert client.patch("/api/cards/card-missing", json={"title": "T"}).status_code == 404
    assert client.delete("/api/cards/card-missing").status_code == 404
    assert client.post(
        "/api/cards/card-missing/move", json={"columnId": column_id, "position": 0}
    ).status_code == 404
    assert client.post(
        f"/api/cards/{card_id}/move", json={"columnId": "col-missing", "position": 0}
    ).status_code == 404
    assert client.get("/api/board").json() == board


def test_cannot_touch_another_users_board(client):
    with db.transaction() as conn:
        other_board = db.get_board(conn, db.get_or_create_board_id(conn, "other"))
    other_column = other_board["columns"][0]["id"]
    other_card = other_board["columns"][0]["cardIds"][0]

    assert client.patch(f"/api/columns/{other_column}", json={"title": "T"}).status_code == 404
    assert client.patch(f"/api/cards/{other_card}", json={"title": "T"}).status_code == 404
    assert client.delete(f"/api/cards/{other_card}").status_code == 404

    with db.transaction() as conn:
        assert db.get_board(conn, db.get_or_create_board_id(conn, "other")) == other_board


@pytest.mark.parametrize(
    ("method", "path_kind", "body"),
    [
        ("patch", "column", {"title": ""}),
        ("post", "cards", {"title": ""}),
        ("patch", "card", {"title": ""}),
        ("post", "move", {"position": -1}),
    ],
)
def test_invalid_input_returns_422(client, method, path_kind, body):
    board = client.get("/api/board").json()
    column_id = board["columns"][0]["id"]
    card_id = board["columns"][0]["cardIds"][0]
    path, payload = {
        "column": (f"/api/columns/{column_id}", body),
        "cards": ("/api/cards", {"columnId": column_id, **body}),
        "card": (f"/api/cards/{card_id}", body),
        "move": (f"/api/cards/{card_id}/move", {"columnId": column_id, **body}),
    }[path_kind]
    assert client.request(method, path, json=payload).status_code == 422


def test_data_persists_across_restarts(client):
    board = client.get("/api/board").json()
    card_id = board["columns"][0]["cardIds"][0]
    client.patch(f"/api/cards/{card_id}", json={"title": "Persisted", "details": ""})

    with TestClient(app) as restarted:
        restarted.post("/api/auth/login", json={"username": "user", "password": "password"})
        assert restarted.get("/api/board").json()["cards"][card_id]["title"] == "Persisted"


def test_failed_change_rolls_back(client):
    board = client.get("/api/board").json()
    with pytest.raises(db.NotFound):
        with db.transaction() as conn:
            board_id = db.get_or_create_board_id(conn, "user")
            db.rename_column(conn, board_id, board["columns"][0]["id"], "Half done")
            db.rename_column(conn, board_id, "col-missing", "Fails")
    assert client.get("/api/board").json() == board


@pytest.mark.parametrize("title", [" ", "   \t", "x" * 201])
def test_blank_or_too_long_titles_are_rejected(client, title):
    board = client.get("/api/board").json()
    column_id = board["columns"][0]["id"]
    card_id = board["columns"][0]["cardIds"][0]
    assert client.patch(f"/api/columns/{column_id}", json={"title": title}).status_code == 422
    assert client.post("/api/cards", json={"columnId": column_id, "title": title}).status_code == 422
    assert client.patch(f"/api/cards/{card_id}", json={"title": title}).status_code == 422


def test_too_long_details_are_rejected(client):
    column_id = client.get("/api/board").json()["columns"][0]["id"]
    response = client.post(
        "/api/cards", json={"columnId": column_id, "title": "T", "details": "x" * 2001}
    )
    assert response.status_code == 422


def test_titles_and_details_are_stripped(client):
    column_id = client.get("/api/board").json()["columns"][0]["id"]
    board = client.post(
        "/api/cards", json={"columnId": column_id, "title": "  Padded  ", "details": " d "}
    ).json()
    new_id = board["columns"][0]["cardIds"][-1]
    assert board["cards"][new_id] == {"id": new_id, "title": "Padded", "details": "d"}


def test_reads_happen_inside_the_transaction(db_file):
    db.init_db()
    with db.transaction() as conn:
        conn.execute("SELECT 1 FROM columns").fetchall()
        assert conn.in_transaction


def test_concurrent_moves_keep_positions_consistent(client):
    board = client.get("/api/board").json()
    card_ids = list(board["cards"])
    column_ids = [c["id"] for c in board["columns"]]

    def move(i):
        with db.transaction() as conn:
            board_id = db.get_or_create_board_id(conn, "user")
            db.move_card(conn, board_id, card_ids[i % len(card_ids)], column_ids[i % 5], i % 3)

    with ThreadPoolExecutor(max_workers=8) as pool:
        list(pool.map(move, range(80)))

    with db.transaction() as conn:
        rows = conn.execute("SELECT column_id, position FROM cards ORDER BY column_id, position").fetchall()
    by_column = {}
    for row in rows:
        by_column.setdefault(row["column_id"], []).append(row["position"])
    assert sum(len(p) for p in by_column.values()) == 8
    assert all(positions == list(range(len(positions))) for positions in by_column.values())


def test_concurrent_first_access_creates_one_board(db_file):
    db.init_db()

    def first_access(_):
        with db.transaction() as conn:
            return db.get_or_create_board_id(conn, "newcomer")

    with ThreadPoolExecutor(max_workers=8) as pool:
        board_ids = set(pool.map(first_access, range(16)))
    assert len(board_ids) == 1
