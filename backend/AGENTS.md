# Backend

FastAPI app managed with uv (Python 3.13). Not a packaged project: code lives in `app/`, tests in `tests/`.

## Commands (run from `backend/`)

```bash
uv sync                                           # install deps including dev
STATIC_DIR=../frontend/out uv run uvicorn app.main:app --reload --port 8000  # serve API + built frontend (run `npm run build` in frontend/ first)
uv run uvicorn app.main:app --reload --port 8000                             # API only (no app/static), for use with the Next dev server
uv run pytest                                     # all tests
uv run pytest tests/test_health.py::test_health   # single test
rm -rf data                                       # reset the local DB (recreated and reseeded on next start)
```

## Structure

- `app/main.py` - FastAPI app. API routes live under `/api`. The frontend static export is mounted at `/` last (with `html=True`), so it must stay after all route definitions. Its directory comes from the `STATIC_DIR` env var, defaulting to `app/static/` (where the Docker build copies `frontend/out`; git-ignored). If the directory does not exist, only the API is served.
- `app/db.py` - SQLite via `sqlite3` (schema and rationale in `docs/DATABASE.md`). `init_db()` runs on startup (FastAPI lifespan) and creates the file at `DB_PATH` (default `backend/data/pm.db` whatever the working directory; git-ignored) and tables if missing. `transaction()` opens a connection with foreign keys on and runs the block in `BEGIN IMMEDIATE ... COMMIT` (rollback on error), so reads inside a change are consistent and concurrent changes are serialized. Use it for every DB access. `get_or_create_board_id()` creates the user and a seeded default board on first access. Board functions (`rename_column`, `create_card`, `update_card`, `delete_card`, `move_card`) take a `board_id`, check ownership and raise `NotFound` (mapped to 404) otherwise; they are meant to be reused by the AI in Part 9.
- `app/models.py` - Pydantic models: `Board` (same shape as the frontend `BoardData`) and request bodies. All models use camelCase in JSON (`CamelModel`, e.g. `cardIds`, `columnId`) and snake_case in Python. Titles are stripped and must be 1-200 characters; details are stripped and at most 2000.
- Auth: Starlette `SessionMiddleware` keeps the username in a signed cookie (`session`), keyed by the `SESSION_SECRET` env var. If unset, a random key is generated at startup, so sessions end on restart (including `--reload`). Credentials are hardcoded (`user` / `password`) for the MVP.
- `tests/` - pytest with FastAPI `TestClient` (uses `httpx2`). `tests/conftest.py` points `STATIC_DIR` at a stub export and `DB_PATH` at a temp file before the app is imported. Board tests set their own `DB_PATH` per test and use `with TestClient(app)` so the lifespan (`init_db`) runs.

## Routes

- `GET /api/health` - returns `{"status": "ok"}`.
- `POST /api/auth/login` - body `{username, password}`; sets the session and returns `{username}`, or 401.
- `POST /api/auth/logout` - clears the session.
- `GET /api/auth/me` - returns `{username}` for the current session, or 401.

Board routes require a session (401 otherwise), return 404 for ids not on the user's board, 422 for invalid bodies (e.g. blank or too long title), and return the full updated `Board` on success:

- `GET /api/board`
- `PATCH /api/columns/{column_id}` - body `{title}`
- `POST /api/cards` - body `{columnId, title, details?}`; appends to the column
- `PATCH /api/cards/{card_id}` - body `{title, details?}`
- `DELETE /api/cards/{card_id}`
- `POST /api/cards/{card_id}/move` - body `{columnId, position}`; position is clamped to the column length

## Docker

The root `Dockerfile` builds the frontend in a Node stage and copies `out/` into `app/static/`, then installs deps with `uv sync --locked --no-dev` and runs uvicorn from the venv on port 8000 as the non-root `app` user, with a `HEALTHCHECK` on `/api/health`. After changing dependencies, commit the updated `uv.lock` or the image build fails. `docker-compose.yml` loads `.env`, mounts a `data` volume at `/app/data` (where the default `DB_PATH` puts the SQLite file) and restarts the container unless stopped. The port opens before uvicorn is ready, so wait for `/api/health` to return `ok` rather than just a connection.
