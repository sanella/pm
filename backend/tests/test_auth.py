import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("DB_PATH", str(tmp_path / "pm.db"))
    with TestClient(app) as client:
        yield client


def login(client, username="user", password="password"):
    return client.post("/api/auth/login", json={"username": username, "password": password})


def test_login_success(client):
    response = login(client)
    assert response.status_code == 200
    assert response.json() == {"username": "user"}


@pytest.mark.parametrize(
    ("username", "password"),
    [("user", "wrong"), ("someone", "password"), ("", "")],
)
def test_login_failure(client, username, password):
    response = login(client, username, password)
    assert response.status_code == 401
    assert client.get("/api/auth/me").status_code == 401


def test_me_without_session(client):
    assert client.get("/api/auth/me").status_code == 401


def test_me_with_session(client):
    login(client)
    response = client.get("/api/auth/me")
    assert response.status_code == 200
    assert response.json() == {"username": "user"}


def test_logout_clears_session(client):
    login(client)
    assert client.post("/api/auth/logout").status_code == 200
    assert client.get("/api/auth/me").status_code == 401


def test_tampered_cookie_is_rejected(client):
    login(client)
    valid = client.cookies["session"]
    client.cookies.clear()
    client.cookies.set("session", valid[:-4] + "AAAA")
    assert client.get("/api/auth/me").status_code == 401
