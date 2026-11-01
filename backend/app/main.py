import os
import secrets
from collections.abc import Callable
from contextlib import asynccontextmanager
from pathlib import Path
from sqlite3 import Connection
from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from openai import OpenAIError
from pydantic import ValidationError
from starlette.middleware.sessions import SessionMiddleware

from app import ai, auth, db
from app.models import (
    ActivityEntry,
    AddChecklistItemRequest,
    AddMemberRequest,
    Board,
    BoardMembers,
    BoardSummary,
    BoardTitleRequest,
    ChatRequest,
    ChangePasswordRequest,
    ChatResponse,
    Comment,
    CommentRequest,
    CreateCardRequest,
    CreateColumnRequest,
    DeleteAccountRequest,
    LoginRequest,
    MoveCardRequest,
    MoveColumnRequest,
    RegisterRequest,
    RenameColumnRequest,
    UpdateCardRequest,
    UpdateChecklistItemRequest,
)

STATIC_DIR = Path(os.environ.get("STATIC_DIR", Path(__file__).parent / "static"))
# Without SESSION_SECRET a random key is used, so sessions end when the server restarts.
SESSION_SECRET = os.environ.get("SESSION_SECRET") or secrets.token_hex(32)

# Demo account, always available so the app can be tried without signing up.
DEMO_USERNAME = "user"
DEMO_PASSWORD = "password"
# Checked when the username is unknown, so a login takes as long whether or not it exists.
UNKNOWN_USER_HASH = auth.hash_password(secrets.token_hex(16))


def ensure_demo_user() -> None:
    with db.transaction() as conn:
        user = db.get_user(conn, DEMO_USERNAME)
        if user is None:
            db.create_user(conn, DEMO_USERNAME, auth.hash_password(DEMO_PASSWORD))
        elif user["password_hash"] is None:
            # A user row from before accounts existed.
            db.set_password_hash(conn, user["id"], auth.hash_password(DEMO_PASSWORD))


@asynccontextmanager
async def lifespan(app: FastAPI):
    db.init_db()
    ensure_demo_user()
    yield


app = FastAPI(lifespan=lifespan)
app.add_middleware(SessionMiddleware, secret_key=SESSION_SECRET)


@app.exception_handler(db.NotFound)
def not_found_handler(request: Request, exc: db.NotFound):
    return JSONResponse(status_code=404, content={"detail": str(exc)})


@app.exception_handler(db.Forbidden)
def forbidden_handler(request: Request, exc: db.Forbidden):
    return JSONResponse(status_code=403, content={"detail": str(exc)})


@app.exception_handler(db.Conflict)
def conflict_handler(request: Request, exc: db.Conflict):
    return JSONResponse(status_code=409, content={"detail": str(exc)})


def current_user(request: Request) -> int:
    """The signed-in user's id; 401 if signed out or the account no longer exists."""
    user_id = request.session.get("user_id")
    if user_id is not None:
        with db.transaction() as conn:
            if db.get_user_by_id(conn, user_id):
                return user_id
    request.session.clear()
    raise HTTPException(status_code=401, detail="Not signed in")


CurrentUser = Annotated[int, Depends(current_user)]


def sign_in(request: Request, user_id: int, username: str) -> dict:
    request.session.clear()
    request.session["user_id"] = user_id
    return {"username": username}


def check_password(user_id: int, password: str) -> None:
    """403 unless `password` is the user's. scrypt runs outside any transaction, so the
    slow hash never holds the database's write lock."""
    with db.transaction() as conn:
        password_hash = db.get_user_by_id(conn, user_id)["password_hash"]
    if not auth.verify_password(password, password_hash):
        raise HTTPException(status_code=403, detail="Wrong password")


def change_board(
    user_id: int, board_id: int, change: Callable[[Connection], str | None]
) -> dict:
    """Apply a change to one of the user's boards in one transaction; return the updated board.

    The change returns a description for the activity log (None to log nothing).
    """
    with db.transaction() as conn:
        db.require_board(conn, user_id, board_id)
        message = change(conn)
        if message:
            db.log_activity(conn, board_id, user_id, message)
        return db.get_board(conn, board_id)


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/register", status_code=201)
def register(body: RegisterRequest, request: Request):
    password_hash = auth.hash_password(body.password)
    with db.transaction() as conn:
        user_id = db.create_user(conn, body.username, password_hash)
        db.create_board(conn, user_id, "My board", demo_cards=True)
    return sign_in(request, user_id, body.username)


@app.post("/api/auth/login")
def login(credentials: LoginRequest, request: Request):
    with db.transaction() as conn:
        user = db.get_user(conn, credentials.username)
    password_hash = user["password_hash"] if user else UNKNOWN_USER_HASH
    if not auth.verify_password(credentials.password, password_hash) or user is None:
        raise HTTPException(status_code=401, detail="Invalid username or password")
    return sign_in(request, user["id"], user["username"])


@app.post("/api/auth/logout")
def logout(request: Request):
    request.session.clear()
    return {"status": "ok"}


@app.get("/api/auth/me")
def me(user_id: CurrentUser):
    with db.transaction() as conn:
        return {"username": db.get_user_by_id(conn, user_id)["username"]}


@app.post("/api/auth/password")
def change_password(body: ChangePasswordRequest, user_id: CurrentUser):
    check_password(user_id, body.current_password)
    new_hash = auth.hash_password(body.new_password)
    with db.transaction() as conn:
        db.set_password_hash(conn, user_id, new_hash)
    return {"status": "ok"}


@app.post("/api/auth/delete-account")
def delete_account(body: DeleteAccountRequest, request: Request, user_id: CurrentUser):
    check_password(user_id, body.password)
    with db.transaction() as conn:
        db.delete_user(conn, user_id)
    request.session.clear()
    return {"status": "ok"}


def create_card_from(conn: Connection, board_id: int, body: CreateCardRequest) -> str:
    return db.create_card(
        conn,
        board_id,
        body.column_id,
        body.title,
        body.details,
        body.priority,
        body.due_date.isoformat() if body.due_date else None,
        body.labels,
    )


@app.get("/api/boards")
def list_boards(user_id: CurrentUser) -> list[BoardSummary]:
    with db.transaction() as conn:
        return db.list_boards(conn, user_id)


@app.post("/api/boards", status_code=201)
def create_board(body: BoardTitleRequest, user_id: CurrentUser) -> BoardSummary:
    with db.transaction() as conn:
        return db.board_summary(conn, user_id, db.create_board(conn, user_id, body.title))


@app.patch("/api/boards/{board_id}")
def rename_board(board_id: int, body: BoardTitleRequest, user_id: CurrentUser) -> BoardSummary:
    with db.transaction() as conn:
        old_title = db.board_summary(conn, user_id, board_id)["title"]
        db.rename_board(conn, user_id, board_id, body.title)
        db.log_activity(conn, board_id, user_id, f'renamed the board "{old_title}" to "{body.title}"')
        return db.board_summary(conn, user_id, board_id)


@app.delete("/api/boards/{board_id}")
def delete_board(board_id: int, user_id: CurrentUser):
    with db.transaction() as conn:
        db.delete_board(conn, user_id, board_id)
    return {"status": "ok"}


@app.get("/api/boards/{board_id}/members")
def list_members(board_id: int, user_id: CurrentUser) -> BoardMembers:
    with db.transaction() as conn:
        db.require_board(conn, user_id, board_id)
        return db.list_members(conn, board_id)


@app.post("/api/boards/{board_id}/members")
def add_member(board_id: int, body: AddMemberRequest, user_id: CurrentUser) -> BoardMembers:
    with db.transaction() as conn:
        db.require_owner(conn, user_id, board_id)
        db.add_member(conn, board_id, body.username)
        db.log_activity(conn, board_id, user_id, f"added {body.username} to the board")
        return db.list_members(conn, board_id)


@app.delete("/api/boards/{board_id}/members/{username}")
def remove_member(board_id: int, username: str, user_id: CurrentUser) -> BoardMembers:
    """The owner removes anyone; a member can remove only themselves (leave the board)."""
    with db.transaction() as conn:
        db.require_board(conn, user_id, board_id)
        leaving = db.get_user_by_id(conn, user_id)["username"].lower() == username.lower()
        if not leaving:
            db.require_owner(conn, user_id, board_id)
        db.remove_member(conn, board_id, username)
        message = "left the board" if leaving else f"removed {username} from the board"
        db.log_activity(conn, board_id, user_id, message)
        return db.list_members(conn, board_id)


@app.get("/api/boards/{board_id}/activity")
def list_activity(board_id: int, user_id: CurrentUser) -> list[ActivityEntry]:
    with db.transaction() as conn:
        db.require_board(conn, user_id, board_id)
        return db.list_activity(conn, board_id)


@app.get("/api/boards/{board_id}/cards/{card_id}/comments")
def list_comments(board_id: int, card_id: str, user_id: CurrentUser) -> list[Comment]:
    with db.transaction() as conn:
        db.require_board(conn, user_id, board_id)
        return db.list_comments(conn, board_id, card_id, user_id)


@app.post("/api/boards/{board_id}/cards/{card_id}/comments")
def add_comment(
    board_id: int, card_id: str, body: CommentRequest, user_id: CurrentUser
) -> list[Comment]:
    with db.transaction() as conn:
        db.require_board(conn, user_id, board_id)
        message = db.add_comment(conn, board_id, card_id, user_id, body.text)
        db.log_activity(conn, board_id, user_id, message)
        return db.list_comments(conn, board_id, card_id, user_id)


@app.delete("/api/boards/{board_id}/cards/{card_id}/comments/{comment_id}")
def delete_comment(
    board_id: int, card_id: str, comment_id: str, user_id: CurrentUser
) -> list[Comment]:
    with db.transaction() as conn:
        db.require_board(conn, user_id, board_id)
        db.delete_comment(conn, board_id, card_id, comment_id, user_id)
        return db.list_comments(conn, board_id, card_id, user_id)


@app.post("/api/boards/{board_id}/cards/{card_id}/checklist")
def add_checklist_item(
    board_id: int, card_id: str, body: AddChecklistItemRequest, user_id: CurrentUser
) -> Board:
    return change_board(
        user_id, board_id, lambda conn: db.add_checklist_item(conn, board_id, card_id, body.text)
    )


@app.patch("/api/boards/{board_id}/cards/{card_id}/checklist/{item_id}")
def update_checklist_item(
    board_id: int,
    card_id: str,
    item_id: str,
    body: UpdateChecklistItemRequest,
    user_id: CurrentUser,
) -> Board:
    return change_board(
        user_id,
        board_id,
        lambda conn: db.update_checklist_item(conn, board_id, card_id, item_id, body.changes()),
    )


@app.delete("/api/boards/{board_id}/cards/{card_id}/checklist/{item_id}")
def delete_checklist_item(board_id: int, card_id: str, item_id: str, user_id: CurrentUser) -> Board:
    return change_board(
        user_id, board_id, lambda conn: db.delete_checklist_item(conn, board_id, card_id, item_id)
    )


@app.get("/api/boards/{board_id}")
def read_board(board_id: int, user_id: CurrentUser) -> Board:
    return change_board(user_id, board_id, lambda conn: None)


@app.patch("/api/boards/{board_id}/columns/{column_id}")
def rename_column(
    board_id: int, column_id: str, body: RenameColumnRequest, user_id: CurrentUser
) -> Board:
    return change_board(
        user_id, board_id, lambda conn: db.rename_column(conn, board_id, column_id, body.title)
    )


@app.post("/api/boards/{board_id}/columns")
def add_column(board_id: int, body: CreateColumnRequest, user_id: CurrentUser) -> Board:
    return change_board(user_id, board_id, lambda conn: db.add_column(conn, board_id, body.title))


@app.post("/api/boards/{board_id}/columns/{column_id}/move")
def move_column(
    board_id: int, column_id: str, body: MoveColumnRequest, user_id: CurrentUser
) -> Board:
    return change_board(
        user_id, board_id, lambda conn: db.move_column(conn, board_id, column_id, body.position)
    )


@app.delete("/api/boards/{board_id}/columns/{column_id}")
def delete_column(
    board_id: int,
    column_id: str,
    user_id: CurrentUser,
    move_cards_to: Annotated[str | None, Query(alias="moveTo")] = None,
) -> Board:
    """Delete a column; its cards move to `moveTo` when given, otherwise they are deleted."""
    return change_board(
        user_id,
        board_id,
        lambda conn: db.delete_column(conn, board_id, column_id, move_cards_to),
    )


@app.post("/api/boards/{board_id}/cards")
def create_card(board_id: int, body: CreateCardRequest, user_id: CurrentUser) -> Board:
    return change_board(
        user_id,
        board_id,
        lambda conn: create_card_from(conn, board_id, body),
    )


@app.patch("/api/boards/{board_id}/cards/{card_id}")
def update_card(board_id: int, card_id: str, body: UpdateCardRequest, user_id: CurrentUser) -> Board:
    return change_board(
        user_id,
        board_id,
        lambda conn: db.update_card(conn, board_id, card_id, body.changes()),
    )


@app.delete("/api/boards/{board_id}/cards/{card_id}")
def delete_card(board_id: int, card_id: str, user_id: CurrentUser) -> Board:
    return change_board(user_id, board_id, lambda conn: db.delete_card(conn, board_id, card_id))


@app.post("/api/boards/{board_id}/cards/{card_id}/move")
def move_card(board_id: int, card_id: str, body: MoveCardRequest, user_id: CurrentUser) -> Board:
    return change_board(
        user_id,
        board_id,
        lambda conn: db.move_card(conn, board_id, card_id, body.column_id, body.position),
    )


def apply_operation(conn: Connection, board_id: int, operation: ai.Operation) -> str | None:
    """Apply one AI operation, validated by the same request models as the board routes.

    Returns its description for the activity log.
    """
    match operation:
        case ai.CreateCard():
            return create_card_from(
                conn, board_id, CreateCardRequest.model_validate(operation.model_dump())
            )
        case ai.UpdateCard():
            body = UpdateCardRequest.model_validate(operation.model_dump(exclude={"type", "card_id"}))
            return db.update_card(conn, board_id, operation.card_id, body.changes())
        case ai.MoveCard():
            body = MoveCardRequest.model_validate(operation.model_dump())
            return db.move_card(conn, board_id, operation.card_id, body.column_id, body.position)
        case ai.DeleteCard():
            return db.delete_card(conn, board_id, operation.card_id)
        case ai.RenameColumn():
            body = RenameColumnRequest.model_validate(operation.model_dump())
            return db.rename_column(conn, board_id, operation.column_id, body.title)
        case ai.AddColumn():
            body = CreateColumnRequest.model_validate(operation.model_dump())
            return db.add_column(conn, board_id, body.title)


@app.post("/api/boards/{board_id}/chat")
def chat(board_id: int, body: ChatRequest, user_id: CurrentUser) -> ChatResponse:
    board = read_board(board_id, user_id)
    # Called outside the transaction so a slow model does not lock the database.
    try:
        reply = ai.chat(board, body.history, body.message)
    except (OpenAIError, ValueError) as exc:
        raise HTTPException(status_code=502, detail=f"AI request failed: {exc}")
    if not reply.operations:
        return ChatResponse(message=reply.message, board=None)

    def apply_all(conn: Connection) -> None:
        for operation in reply.operations:
            message = apply_operation(conn, board_id, operation)
            if message:
                db.log_activity(conn, board_id, user_id, f"{message} (via the AI assistant)")

    # All operations in one transaction: an invalid one rolls back the others.
    try:
        board = change_board(user_id, board_id, apply_all)
    except (db.NotFound, db.Conflict, ValidationError) as exc:
        raise HTTPException(
            status_code=502, detail=f"The AI suggested a change that could not be applied: {exc}"
        )
    return ChatResponse(message=reply.message, board=board)


# Without a frontend build (e.g. backend-only dev), only the API is served.
if STATIC_DIR.exists():
    app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
