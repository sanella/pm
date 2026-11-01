import pytest
from fastapi.testclient import TestClient

from app import ai, db
from app.main import app

DEFAULT_TITLES = ["Backlog", "Discovery", "In Progress", "Review", "Done"]


@pytest.fixture
def db_file(tmp_path, monkeypatch):
    path = tmp_path / "pm.db"
    monkeypatch.setenv("DB_PATH", str(path))
    return path


def signed_in(username):
    client = TestClient(app)
    client.__enter__()
    client.post("/api/auth/register", json={"username": username, "password": "secret-pass"})
    return client


@pytest.fixture
def alice(db_file):
    client = signed_in("alice")
    yield client
    client.__exit__(None, None, None)


@pytest.fixture
def bob(alice):
    client = signed_in("bob")
    yield client
    client.__exit__(None, None, None)


def boards(client):
    return client.get("/api/boards").json()


def create(client, title="Launch"):
    return client.post("/api/boards", json={"title": title})


def test_new_user_starts_with_one_demo_board(alice):
    [board] = boards(alice)
    assert board["title"] == "My board"
    content = alice.get(f"/api/boards/{board['id']}").json()
    assert [c["title"] for c in content["columns"]] == DEFAULT_TITLES
    assert len(content["cards"]) == 8
    assert boards(alice) == [board]


def test_create_board_has_default_columns_and_no_cards(alice):
    response = create(alice, "  Launch plan  ")
    assert response.status_code == 201
    created = response.json()
    assert created["title"] == "Launch plan"

    content = alice.get(f"/api/boards/{created['id']}").json()
    assert [c["title"] for c in content["columns"]] == DEFAULT_TITLES
    assert content["cards"] == {}
    assert [b["title"] for b in boards(alice)] == ["My board", "Launch plan"]


@pytest.mark.parametrize("title", ["", "   ", "x" * 201])
def test_invalid_board_titles_are_rejected(alice, title):
    assert create(alice, title).status_code == 422
    first = boards(alice)[0]["id"]
    assert alice.patch(f"/api/boards/{first}", json={"title": title}).status_code == 422


def test_rename_board(alice):
    board_id = boards(alice)[0]["id"]
    response = alice.patch(f"/api/boards/{board_id}", json={"title": "Roadmap"})
    assert response.json() == {"id": board_id, "title": "Roadmap", "owner": "alice", "isOwner": True}
    assert boards(alice)[0]["title"] == "Roadmap"


def test_delete_board_removes_its_columns_and_cards(alice):
    demo = boards(alice)[0]["id"]
    create(alice)
    content = alice.get(f"/api/boards/{demo}").json()

    assert alice.delete(f"/api/boards/{demo}").status_code == 200

    assert [b["title"] for b in boards(alice)] == ["Launch"]
    assert alice.get(f"/api/boards/{demo}").status_code == 404
    with db.transaction() as conn:
        column_ids = [c["id"] for c in content["columns"]]
        assert not conn.execute(
            f"SELECT 1 FROM columns WHERE id IN ({','.join('?' * len(column_ids))})", column_ids
        ).fetchone()
        assert not conn.execute(
            f"SELECT 1 FROM cards WHERE id IN ({','.join('?' * len(content['cards']))})",
            list(content["cards"]),
        ).fetchone()


def test_the_last_board_cannot_be_deleted(alice):
    [board] = boards(alice)
    assert alice.delete(f"/api/boards/{board['id']}").status_code == 409
    assert boards(alice) == [board]


def test_unknown_board_is_404(alice):
    assert alice.get("/api/boards/9999").status_code == 404
    assert alice.patch("/api/boards/9999", json={"title": "T"}).status_code == 404
    assert alice.delete("/api/boards/9999").status_code == 404


def test_users_cannot_see_or_change_each_others_boards(alice, bob):
    alice_board = boards(alice)[0]["id"]
    content = alice.get(f"/api/boards/{alice_board}").json()
    column_id = content["columns"][0]["id"]
    card_id = content["columns"][0]["cardIds"][0]
    path = f"/api/boards/{alice_board}"

    assert [b["id"] for b in boards(bob)] != [alice_board]
    assert bob.get(path).status_code == 404
    assert bob.patch(path, json={"title": "Mine"}).status_code == 404
    assert bob.delete(path).status_code == 404
    assert bob.patch(f"{path}/columns/{column_id}", json={"title": "T"}).status_code == 404
    assert bob.post(f"{path}/cards", json={"columnId": column_id, "title": "T"}).status_code == 404
    assert bob.patch(f"{path}/cards/{card_id}", json={"title": "T"}).status_code == 404
    assert bob.delete(f"{path}/cards/{card_id}").status_code == 404
    assert bob.post(f"{path}/chat", json={"message": "Hi"}).status_code == 404

    assert alice.get(path).json() == content
    assert boards(alice)[0]["title"] == "My board"


def test_ids_from_one_board_do_not_work_on_another(alice):
    demo = boards(alice)[0]["id"]
    other = create(alice).json()["id"]
    content = alice.get(f"/api/boards/{demo}").json()
    card_id = content["columns"][0]["cardIds"][0]
    other_column = alice.get(f"/api/boards/{other}").json()["columns"][0]["id"]

    assert alice.patch(f"/api/boards/{other}/cards/{card_id}", json={"title": "T"}).status_code == 404
    assert alice.delete(f"/api/boards/{other}/cards/{card_id}").status_code == 404
    # Moving a card to a column of another board is refused too.
    response = alice.post(
        f"/api/boards/{demo}/cards/{card_id}/move", json={"columnId": other_column, "position": 0}
    )
    assert response.status_code == 404
    assert alice.get(f"/api/boards/{demo}").json() == content


def test_changes_stay_on_their_board(alice):
    demo = boards(alice)[0]["id"]
    other = create(alice).json()["id"]
    demo_content = alice.get(f"/api/boards/{demo}").json()
    column_id = alice.get(f"/api/boards/{other}").json()["columns"][0]["id"]

    updated = alice.post(
        f"/api/boards/{other}/cards", json={"columnId": column_id, "title": "Only here"}
    ).json()

    assert [c["title"] for c in updated["cards"].values()] == ["Only here"]
    assert alice.get(f"/api/boards/{demo}").json() == demo_content


def test_chat_works_on_the_chosen_board(alice, monkeypatch):
    other = create(alice).json()["id"]
    column_id = alice.get(f"/api/boards/{other}").json()["columns"][0]["id"]
    seen = []

    def fake_chat(board, history, message):
        seen.append(board)
        return ai.AIResponse(
            message="Added",
            operations=[ai.CreateCard(type="create_card", column_id=column_id, title="AI card", details="", priority="none", due_date=None, labels=[])],
        )

    monkeypatch.setattr(ai, "chat", fake_chat)
    response = alice.post(f"/api/boards/{other}/chat", json={"message": "Add a card"})

    assert response.status_code == 200
    assert seen[0]["cards"] == {}
    assert [c["title"] for c in response.json()["board"]["cards"].values()] == ["AI card"]


def test_version_1_boards_are_kept_by_migration_2(db_file, monkeypatch):
    all_migrations = db.MIGRATIONS
    # A real version 1 database: only the first migration applied.
    monkeypatch.setattr(db, "MIGRATIONS", all_migrations[:1])
    db.init_db()
    with db.transaction() as conn:
        user_id = db.create_user(conn, "carol", "unused-hash")
        board_id = conn.execute("INSERT INTO boards (user_id) VALUES (?)", (user_id,)).lastrowid
        conn.execute("INSERT INTO columns VALUES ('col-a', ?, 'Todo', 0)", (board_id,))
        conn.execute("INSERT INTO cards VALUES ('card-a', 'col-a', 'Keep me', 'Details', 0)")

    monkeypatch.setattr(db, "MIGRATIONS", all_migrations)
    db.init_db()

    with db.transaction() as conn:
        assert db.list_boards(conn, user_id) == [
            {"id": board_id, "title": "My board", "owner": "carol", "isOwner": True}
        ]
        board = db.get_board(conn, board_id)
        assert board["columns"] == [{"id": "col-a", "title": "Todo", "cardIds": ["card-a"]}]
        assert board["cards"]["card-a"]["title"] == "Keep me"
        # The rebuilt table still cascades: deleting the user removes the cards.
        db.delete_user(conn, user_id)
        assert not conn.execute("SELECT 1 FROM cards").fetchone()
