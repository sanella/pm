# Backend

FastAPI app managed with uv (Python 3.13). Not a packaged project: code lives in `app/`, tests in `tests/`.

## Commands (run from `backend/`)

```bash
uv sync                                           # install deps including dev
STATIC_DIR=../frontend/out uv run uvicorn app.main:app --reload --port 8000  # serve API + built frontend (run `npm run build` in frontend/ first)
uv run pytest                                     # all tests
uv run pytest tests/test_health.py::test_health   # single test
```

## Structure

- `app/main.py` - FastAPI app. API routes live under `/api`. The frontend static export is mounted at `/` last (with `html=True`), so it must stay after all route definitions. Its directory comes from the `STATIC_DIR` env var, defaulting to `app/static/` (where the Docker build copies `frontend/out`; git-ignored). The directory must exist at import time.
- `tests/` - pytest with FastAPI `TestClient` (uses `httpx2`). `tests/conftest.py` points `STATIC_DIR` at a temp dir with a stub `index.html` before the app is imported.

## Routes

- `GET /api/health` - returns `{"status": "ok"}`.

## Docker

The root `Dockerfile` builds the frontend in a Node stage and copies `out/` into `app/static/`, then installs deps with `uv sync --locked --no-dev` and runs uvicorn on port 8000. After changing dependencies, commit the updated `uv.lock` or the image build fails. `docker-compose.yml` mounts a `data` volume at `/app/data` for the SQLite file (used from Part 6).
