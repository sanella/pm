# Backend

FastAPI app managed with uv (Python 3.13). Not a packaged project: code lives in `app/`, tests in `tests/`.

## Commands (run from `backend/`)

```bash
uv sync                                           # install deps including dev
STATIC_DIR=../frontend/out uv run uvicorn app.main:app --reload --port 8000  # serve API + built frontend (run `npm run build` in frontend/ first)
uv run uvicorn app.main:app --reload --port 8000                             # API only (no app/static), for use with the Next dev server
uv run pytest                                     # all tests
uv run pytest tests/test_health.py::test_health   # single test
uv run pytest --cov=app                           # with line and branch coverage; fails under 95%
rm -rf data                                       # reset the local DB (recreated and reseeded on next start)
uv run --env-file ../.env pytest -m live          # live OpenRouter tests (skipped without OPENROUTER_API_KEY)
uv run --env-file ../.env uvicorn app.main:app --reload --port 8000  # API with the AI chat working
```

In the container (key from `.env` via compose): `docker compose exec app python -c "from app.ai import ask; print(ask('What is 2+2?'))"`.

## Structure

- `app/main.py` - FastAPI app. API routes live under `/api`. The frontend static export is mounted at `/` last (with `html=True`), so it must stay after all route definitions. Its directory comes from the `STATIC_DIR` env var, defaulting to `app/static/` (where the Docker build copies `frontend/out`; git-ignored). If the directory does not exist, only the API is served.
- `app/db.py` - SQLite via `sqlite3` (schema and rationale in `docs/DATABASE.md`). `init_db()` runs on startup (FastAPI lifespan) and creates the file at `DB_PATH` (default `backend/data/pm.db` whatever the working directory; git-ignored) and tables if missing. `transaction()` opens a connection with foreign keys on and runs the block in `BEGIN IMMEDIATE ... COMMIT` (rollback on error), so reads inside a change are consistent and concurrent changes are serialized. Use it for every DB access. User functions: `create_user` (raises `Conflict`, mapped to 409, for a taken name), `get_user`, `get_user_by_id`, `set_password_hash`, `delete_user`. Board list functions: `create_board(user_id, title, demo_cards=False)` (default columns, optionally the demo cards; registration creates a demo board), `list_boards` (creates a demo board for a user with none), `require_board` (owner or member, else `NotFound` mapped to 404), `require_owner` (also `Forbidden`, mapped to 403, for members), `board_summary`, `rename_board` and `delete_board` (owner only; `Conflict` for the last own board), `list_members`, `add_member`, `remove_member`. Board content functions (`rename_column`, `add_column`, `move_column`, `delete_column`, `create_card`, `update_card(changes)` with keys from `CARD_FIELDS`, `delete_card`, `move_card`) take a `board_id` already checked by `require_board` (routes go through `change_board(user_id, board_id, change)`, which logs the description the change returns), each returning a description for the activity log (e.g. `moved card "X" to "Done"`; `update_card` returns None for an empty change), and raise `NotFound` for columns or cards not on that board; the chat route reuses them for AI operations.
- `app/models.py` - Pydantic models: `Board` (same shape as the frontend `BoardData`), request bodies, and chat `ChatMessage` / `ChatRequest` / `ChatResponse`. All models use camelCase in JSON (`CamelModel`, e.g. `cardIds`, `columnId`) and snake_case in Python. Titles are stripped and must be 1-200 characters; details are stripped and at most 2000. Cards also have `checklist` (`[{id, text, done}]`, read-only in card requests; changed through the checklist routes), `priority` (`none`/`low`/`medium`/`high`), `dueDate` (ISO date or null) and `labels` (at most 10, each 1-30 characters after stripping, repeats dropped ignoring case). `UpdateCardRequest` is partial: its non-nullable fields default to an unvalidated None, so leaving them out is allowed but sending null is not; `changes()` returns just the fields sent.
- `app/ai.py` - OpenRouter through the `openai` SDK (`base_url` `https://openrouter.ai/api/v1`, model `openai/gpt-oss-120b`). `get_client()` raises `OpenAIError` if `OPENROUTER_API_KEY` is unset (checked explicitly so the SDK never falls back to `OPENAI_API_KEY`). `ask()` sends one question (connectivity check). `chat(board, history, message)` sends `SYSTEM_PROMPT` plus the board JSON, the history and the message, and parses the structured reply into `AIResponse` (`message` and a list of `operations`, a discriminated union on `type`: `create_card`, `update_card`, `move_card`, `delete_card`, `rename_column`, `add_column`; card operations carry every card field, and `update_card` replaces them all). The system message includes today's date, so relative due dates work with `chat.completions.parse`. OpenRouter is told to use only providers that support structured outputs (`provider.require_parameters`). The operation models use plain strings, because length limits in a strict JSON schema are not reliably supported; limits are checked when applying.
- Auth: accounts live in `users` with scrypt hashes (`app/auth.py`, standard library only). Starlette `SessionMiddleware` keeps the user id in a signed cookie (`session`), keyed by the `SESSION_SECRET` env var; if unset, a random key is generated at startup, so sessions end on restart (including `--reload`). `current_user` checks on every request that the user still exists (a deleted account's session gets 401). Login hashes against a throwaway hash for unknown usernames, so timing does not reveal which names exist. Usernames ignore case everywhere (lookups use `COLLATE NOCASE`; responses use the registered spelling). scrypt never runs inside `db.transaction()`: the write lock would block every other change for the length of the hash (`check_password` reads the hash in a short transaction, then verifies outside). The demo account `user` / `password` is created on startup (or given that password if its row predates accounts); a changed demo password is kept.
- `tests/` - pytest with FastAPI `TestClient` (uses `httpx2`). `tests/conftest.py` points `STATIC_DIR` at a stub export and `DB_PATH` at a temp file before the app is imported. Board tests set their own `DB_PATH` per test and use `with TestClient(app)` so the lifespan (`init_db`) runs. `client.board` (set by the board and chat test fixtures) is the URL of the signed-in user's first board. `test_boards.py` covers multiple boards with two registered users (`alice`, `bob`); `test_sharing.py` covers sharing with an owner, a member and an outsider. AI tests never call OpenRouter: `test_ai.py` replaces `ai.get_client` with a mock and `test_chat.py` replaces `ai.chat` (`reply_with(*operations)`). Tests marked `live` call the real API and are skipped without `OPENROUTER_API_KEY`.

## Routes

- `GET /api/health` - returns `{"status": "ok"}`.
- `POST /api/auth/register` - body `{username, password}`; username 3-32 of `A-Za-z0-9_.-` (stripped), password 8-128 characters. Creates the user, signs in, returns 201 `{username}`; 409 if taken, 422 if invalid.
- `POST /api/auth/login` - body `{username, password}`; sets the session and returns `{username}`, or 401. Entered passwords (here, current password, delete-account password) are capped at 128 characters and usernames at 32 (422), so oversized input never reaches scrypt.
- `POST /api/auth/password` - body `{currentPassword, newPassword}`; 403 if the current password is wrong, 422 if the new one is invalid.
- `POST /api/auth/delete-account` - body `{password}`; deletes the user with their boards, columns and cards and signs out; 403 if the password is wrong.
- `POST /api/auth/logout` - clears the session.
- `GET /api/auth/me` - returns `{username}` for the current session, or 401.

Board routes require a session (401 otherwise) and return 404 for a board the user neither owns nor is a member of (so its existence is not revealed), or a column or card not on that board; 422 for invalid bodies (e.g. blank or too long title).

- `GET /api/boards` - `[{id, title, owner, isOwner}]` (owner is a username), the user's own and shared boards, oldest first. A user without boards (an account from before multiple boards) gets a "My board" demo board first.
- `POST /api/boards` - body `{title}`; 201 with the board summary; the board gets the 5 default columns and no cards.
- `PATCH /api/boards/{board_id}` - body `{title}`; returns the board summary. Owner only (403 for members).
- `DELETE /api/boards/{board_id}` - deletes the board with its columns, cards and memberships; owner only (403); 409 for the user's only own board (shared boards do not count).
- `GET /api/boards/{board_id}/members` - `{owner, members}` (usernames, members sorted); any member.
- `POST /api/boards/{board_id}/members` - body `{username}`; owner only; 404 for an unknown user, 409 for the owner or an existing member; returns `{owner, members}`.
- `DELETE /api/boards/{board_id}/members/{username}` - the owner removes anyone; a member may remove only themselves (leave), else 403; 404 if not a member.

Comments and activity (any member; 404 for others):

- `GET /api/boards/{board_id}/activity` - latest 100 `{id, author, message, createdAt}`, newest first (`author` is null for a deleted account).
- `GET /api/boards/{board_id}/cards/{card_id}/comments` - `{id, author, text, createdAt, mine}`, oldest first.
- `POST /api/boards/{board_id}/cards/{card_id}/comments` - body `{text}` (1-2000, stripped); returns the comments.
- `DELETE /api/boards/{board_id}/cards/{card_id}/comments/{comment_id}` - author only (403); returns the comments.

Board content routes return the full updated `Board` on success:

- `GET /api/boards/{board_id}`
- `PATCH /api/boards/{board_id}/columns/{column_id}` - body `{title}`
- `POST /api/boards/{board_id}/columns` - body `{title}`; adds an empty column at the end; 409 past 20 columns
- `POST /api/boards/{board_id}/columns/{column_id}/move` - body `{position}`; clamped, counted without the moved column
- `DELETE /api/boards/{board_id}/columns/{column_id}?moveTo={column_id}` - deletes the column; its cards go to the bottom of `moveTo` (in order), or are deleted without it; 409 for the only column or `moveTo` equal to the deleted column
- `POST /api/boards/{board_id}/cards` - body `{columnId, title, details?, priority?, dueDate?, labels?}`; appends to the column
- `PATCH /api/boards/{board_id}/cards/{card_id}` - partial: any of `{title, details, priority, dueDate, labels}`; fields not sent keep their values, `dueDate: null` clears the date, null for the others is 422
- `DELETE /api/boards/{board_id}/cards/{card_id}`
- `POST /api/boards/{board_id}/cards/{card_id}/move` - body `{columnId, position}`; position is clamped to the column length
- `POST /api/boards/{board_id}/cards/{card_id}/checklist` - body `{text}` (1-200); appends an item; 409 past 50
- `PATCH /api/boards/{board_id}/cards/{card_id}/checklist/{item_id}` - partial `{text?, done?}` (null rejected)
- `DELETE /api/boards/{board_id}/cards/{card_id}/checklist/{item_id}`
- `POST /api/boards/{board_id}/chat` - body `{message, history}` (history: earlier `{role: "user" | "assistant", content}` turns, kept by the frontend; message at most 4000 characters, history at most 40 turns of up to 8000, else 422). Returns `{message, board}`: `board` is the updated board if the AI changed it, else `null`. The board is read, then the model is called outside any transaction (so a slow model does not lock the DB), then all operations are applied in one transaction, each validated by the same request model as its board route. Any unknown id, invalid value or conflict (e.g. past the column limit) rolls back every operation and returns 502, as does a failed AI call (including a missing key).

## Docker

The root `Dockerfile` builds the frontend in a Node stage and copies `out/` into `app/static/`, then installs deps with `uv sync --locked --no-dev` and runs uvicorn from the venv on port 8000 as the non-root `app` user, with a `HEALTHCHECK` on `/api/health`. After changing dependencies, commit the updated `uv.lock` or the image build fails. `docker-compose.yml` loads `.env`, mounts a `data` volume at `/app/data` (where the default `DB_PATH` puts the SQLite file) and restarts the container unless stopped. The port opens before uvicorn is ready, so wait for `/api/health` to return `ok` rather than just a connection.
