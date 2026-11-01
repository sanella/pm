# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

Each area has its own detailed notes: `backend/AGENTS.md` (structure, routes, Docker), `frontend/AGENTS.md`, `scripts/AGENTS.md`. Keep them current when changing that area.

## Current state

Work proceeds part by part according to `docs/PLAN.md` (Parts 1-10). Read it before starting work and check off its steps as they complete. Parts 1 and 5 require explicit user sign-off before moving on. Parts 1-6 are done: FastAPI serves the static frontend export at `/` and the API under `/api`; sign-in (`user` / `password`) is enforced via a session cookie; board CRUD routes persist to SQLite (`docs/DATABASE.md`). The frontend calls only the auth routes so far; wiring the board to the API is Part 7. AI chat (Parts 8-10) is not started.

## Commands

Full app in Docker (from the root, needs `.env`): `scripts/start.sh` / `scripts/stop.sh` (Windows: `.ps1`), serves http://localhost:8000.

Backend (from `backend/`):

```bash
uv sync
uv run uvicorn app.main:app --reload --port 8000   # API only, pair with the Next dev server
uv run pytest
uv run pytest tests/test_health.py::test_health    # single test
rm -rf data                                        # reset the local DB (recreated and reseeded on start)
```

Frontend (from `frontend/`):

```bash
npm install
npm run dev                     # :3000; proxies /api to the backend on :8000 (API_URL)
npm run build                   # static export to frontend/out
npm run lint
npm run test:unit               # Vitest (jsdom), src/**/*.test.{ts,tsx}
npx vitest run src/lib/kanban.test.ts          # single unit test file
npx vitest run -t "test name"                  # single test by name
npm run test:e2e                # Playwright; auto-starts its own backend (:8001, temp DB) and dev server (:3001)
npx playwright test tests/kanban.spec.ts -g "test name"
E2E_BASE_URL=http://localhost:8000 npx playwright test   # e2e against the running container
```

## Architecture

- One container: the `Dockerfile` builds the Next.js static export in a Node stage and copies it into `backend/app/static`, which FastAPI mounts at `/` after all `/api` routes (it must stay last). In dev, the Next dev server rewrites `/api/*` to the backend instead.
- The board shape is shared end to end: frontend `BoardData` in `src/lib/kanban.ts` (`{ columns: Column[], cards: Record<id, Card> }`, card order in each column's `cardIds`) matches the backend Pydantic `Board` in `app/models.py` (camelCase JSON). Every board route returns the full updated `Board`. The AI structured output (Part 9) should apply changes through the same `app/db.py` board functions.
- Frontend: `src/app/page.tsx` checks `/api/auth/me` and renders `LoginForm` or `KanbanBoard`. `KanbanBoard` still holds the board in local `useState` seeded from `initialData`. Keep board mutations pure in `src/lib/kanban.ts` (e.g. `moveCard`: dropping on a column id appends, on a card id inserts at its position). Backend calls go through `src/lib/api.ts` with relative `/api` URLs.
- Backend: all DB access goes through `db.transaction()` (`BEGIN IMMEDIATE`, foreign keys on). Board functions take a `board_id`, check ownership and raise `NotFound` (404). The user and a seeded default board are created on first access.

## Color scheme

Defined as CSS variables in `frontend/src/app/globals.css`; use `var(--...)`, not hex values: `--accent-yellow`, `--primary-blue`, `--secondary-purple` (submit buttons), `--navy-dark` (headings, body text), `--gray-text`, plus `--surface`, `--surface-strong`, `--stroke`, `--shadow`.


## DETAILED PLAN

@docs/PLAN.md