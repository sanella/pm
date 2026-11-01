import os
import secrets
from collections.abc import Callable
from contextlib import asynccontextmanager
from pathlib import Path
from sqlite3 import Connection
from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.sessions import SessionMiddleware

from app import db
from app.models import (
    Board,
    CreateCardRequest,
    LoginRequest,
    MoveCardRequest,
    RenameColumnRequest,
    UpdateCardRequest,
)

STATIC_DIR = Path(os.environ.get("STATIC_DIR", Path(__file__).parent / "static"))
# Without SESSION_SECRET a random key is used, so sessions end when the server restarts.
SESSION_SECRET = os.environ.get("SESSION_SECRET") or secrets.token_hex(32)

# MVP: a single hardcoded user.
USERNAME = "user"
PASSWORD = "password"


@asynccontextmanager
async def lifespan(app: FastAPI):
    db.init_db()
    yield


app = FastAPI(lifespan=lifespan)
app.add_middleware(SessionMiddleware, secret_key=SESSION_SECRET)


@app.exception_handler(db.NotFound)
def not_found_handler(request: Request, exc: db.NotFound):
    return JSONResponse(status_code=404, content={"detail": str(exc)})


def current_user(request: Request) -> str:
    username = request.session.get("username")
    if not username:
        raise HTTPException(status_code=401, detail="Not signed in")
    return username


CurrentUser = Annotated[str, Depends(current_user)]


def change_board(username: str, change: Callable[[Connection, int], None]) -> dict:
    """Apply a change to the user's board in one transaction and return the updated board."""
    with db.transaction() as conn:
        board_id = db.get_or_create_board_id(conn, username)
        change(conn, board_id)
        return db.get_board(conn, board_id)


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/login")
def login(credentials: LoginRequest, request: Request):
    if credentials.username != USERNAME or credentials.password != PASSWORD:
        raise HTTPException(status_code=401, detail="Invalid username or password")
    request.session["username"] = credentials.username
    return {"username": credentials.username}


@app.post("/api/auth/logout")
def logout(request: Request):
    request.session.clear()
    return {"status": "ok"}


@app.get("/api/auth/me")
def me(username: CurrentUser):
    return {"username": username}


@app.get("/api/board")
def read_board(username: CurrentUser) -> Board:
    with db.transaction() as conn:
        return db.get_board(conn, db.get_or_create_board_id(conn, username))


@app.patch("/api/columns/{column_id}")
def rename_column(column_id: str, body: RenameColumnRequest, username: CurrentUser) -> Board:
    return change_board(
        username, lambda conn, board_id: db.rename_column(conn, board_id, column_id, body.title)
    )


@app.post("/api/cards")
def create_card(body: CreateCardRequest, username: CurrentUser) -> Board:
    return change_board(
        username,
        lambda conn, board_id: db.create_card(
            conn, board_id, body.column_id, body.title, body.details
        ),
    )


@app.patch("/api/cards/{card_id}")
def update_card(card_id: str, body: UpdateCardRequest, username: CurrentUser) -> Board:
    return change_board(
        username,
        lambda conn, board_id: db.update_card(conn, board_id, card_id, body.title, body.details),
    )


@app.delete("/api/cards/{card_id}")
def delete_card(card_id: str, username: CurrentUser) -> Board:
    return change_board(username, lambda conn, board_id: db.delete_card(conn, board_id, card_id))


@app.post("/api/cards/{card_id}/move")
def move_card(card_id: str, body: MoveCardRequest, username: CurrentUser) -> Board:
    return change_board(
        username,
        lambda conn, board_id: db.move_card(
            conn, board_id, card_id, body.column_id, body.position
        ),
    )


# Without a frontend build (e.g. backend-only dev), only the API is served.
if STATIC_DIR.exists():
    app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
