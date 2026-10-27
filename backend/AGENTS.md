# Backend

FastAPI app managed with uv (Python 3.13). Not a packaged project: code lives in `app/`, tests in `tests/`.

## Commands (run from `backend/`)

```bash
uv sync                                           # install deps including dev
uv run uvicorn app.main:app --reload --port 8000  # dev server
uv run pytest                                     # all tests
uv run pytest tests/test_health.py::test_health   # single test
```

## Structure

- `app/main.py` - FastAPI app. API routes live under `/api`. `app/static/` is mounted at `/` last (with `html=True`), so it must stay after all route definitions.
- `app/static/index.html` - placeholder hello world page that calls `/api/health`. Replaced by the Next.js static export in Part 3.
- `tests/` - pytest with FastAPI `TestClient` (uses `httpx2`).

## Routes

- `GET /api/health` - returns `{"status": "ok"}`.

## Docker

The root `Dockerfile` installs deps with `uv sync --locked --no-dev` and runs uvicorn on port 8000. After changing dependencies, commit the updated `uv.lock` or the image build fails. `docker-compose.yml` mounts a `data` volume at `/app/data` for the SQLite file (used from Part 6).
