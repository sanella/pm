# Backend

FastAPI app managed with uv (Python 3.13). Not a packaged project: code lives in `app/`, tests in `tests/`.

## Commands (run from `backend/`)

```bash
uv sync                                           # install deps including dev
STATIC_DIR=../frontend/out uv run uvicorn app.main:app --reload --port 8000  # serve API + built frontend (run `npm run build` in frontend/ first)
uv run uvicorn app.main:app --reload --port 8000                             # API only (no app/static), for use with the Next dev server
uv run pytest                                     # all tests
uv run pytest tests/test_health.py::test_health   # single test
```

## Structure

- `app/main.py` - FastAPI app. API routes live under `/api`. The frontend static export is mounted at `/` last (with `html=True`), so it must stay after all route definitions. Its directory comes from the `STATIC_DIR` env var, defaulting to `app/static/` (where the Docker build copies `frontend/out`; git-ignored). If the directory does not exist, only the API is served.
- Auth: Starlette `SessionMiddleware` keeps the username in a signed cookie (`session`), keyed by the `SESSION_SECRET` env var (dev default in code). Credentials are hardcoded (`user` / `password`) for the MVP.
- `tests/` - pytest with FastAPI `TestClient` (uses `httpx2`). `tests/conftest.py` points `STATIC_DIR` at a temp dir with a stub `index.html` before the app is imported.

## Routes

- `GET /api/health` - returns `{"status": "ok"}`.
- `POST /api/auth/login` - body `{username, password}`; sets the session and returns `{username}`, or 401.
- `POST /api/auth/logout` - clears the session.
- `GET /api/auth/me` - returns `{username}` for the current session, or 401.

## Docker

The root `Dockerfile` builds the frontend in a Node stage and copies `out/` into `app/static/`, then installs deps with `uv sync --locked --no-dev` and runs uvicorn on port 8000. After changing dependencies, commit the updated `uv.lock` or the image build fails. `docker-compose.yml` mounts a `data` volume at `/app/data` for the SQLite file (used from Part 6).
