# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

Each area has its own detailed notes: `backend/AGENTS.md` (structure, routes, Docker), `frontend/AGENTS.md`, `scripts/AGENTS.md`. Keep them current when changing that area.

## Current state

Work proceeds part by part according to `docs/PLAN.md` (Parts 1-10). Read it before starting work and check off its steps as they complete. Parts 1 and 5 require explicit user sign-off before moving on. Parts 1-10 are implemented: FastAPI serves the static frontend export at `/` and the API under `/api`; sign-in (`user` / `password`) is enforced via a session cookie; the board loads from and saves every change to SQLite through the board routes (`docs/DATABASE.md`); the AI chat sidebar calls `POST /api/chat`, which can change the board. The live AI checks in Parts 8-10 still need `OPENROUTER_API_KEY` in `.env`. Phase 2 (Parts 11-16 in `docs/PLAN.md`) grows the MVP into a multi-user, multi-board app and supersedes the MVP limitations in `AGENTS.md` (hardcoded user, one board); Parts 11 (accounts with hashed passwords, schema migrations) 12 (multiple boards per user, routes under `/api/boards/{id}`) 13 (card priority, due date, labels; partial card updates) 14 (add, reorder, delete columns) 15 (search, filters, board summary) 16 (coverage enforced, review fixes) 17 (sharing boards with other users) 18 (card comments, board activity log) 19 (card checklists) and 20 (final review: hashing outside write locks, case-insensitive usernames) are done. Keep coverage above the thresholds when adding code. Never change the schema except by appending a migration (`docs/DATABASE.md`): the Docker volume holds real data.

## Commands

Full app in Docker (from the root, needs `.env`): `scripts/start.sh` / `scripts/stop.sh` (Windows: `.ps1`), serves http://localhost:8000.

Backend (from `backend/`):

```bash
uv sync
uv run uvicorn app.main:app --reload --port 8000   # API only, pair with the Next dev server
uv run pytest
uv run pytest tests/test_health.py::test_health    # single test
uv run pytest --cov=app                            # with line and branch coverage; fails under 95%
rm -rf data                                        # reset the local DB (recreated and reseeded on start)
```

Frontend (from `frontend/`):

```bash
npm install
npm run dev                     # :3000; proxies /api to the backend on :8000 (API_URL)
npm run build                   # static export to frontend/out
npm run lint
npm run test:unit               # Vitest (jsdom), src/**/*.test.{ts,tsx}
npm run test:coverage           # with coverage thresholds (95% statements/lines, 90% branches/functions)
npx vitest run src/lib/kanban.test.ts          # single unit test file
npx vitest run -t "test name"                  # single test by name
npm run test:e2e                # Playwright; auto-starts its own backend (:8001, temp DB) and dev server (:3001)
npx playwright test tests/kanban.spec.ts -g "test name"
E2E_BASE_URL=http://localhost:8000 npx playwright test   # e2e against the running container
```

## Architecture

- One container: the `Dockerfile` builds the Next.js static export in a Node stage and copies it into `backend/app/static`, which FastAPI mounts at `/` after all `/api` routes (it must stay last). In dev, the Next dev server rewrites `/api/*` to the backend instead.
- The board shape is shared end to end: frontend `BoardData` in `src/lib/kanban.ts` (`{ columns: Column[], cards: Record<id, Card> }`, card order in each column's `cardIds`; a card has `id, title, details, priority, dueDate, labels, checklist`) matches the backend Pydantic `Board` in `app/models.py` (camelCase JSON). Every board route returns the full updated `Board`. AI operations (`app/ai.py`) are applied through the same `app/db.py` board functions and request-model validation, all in one transaction.
- Frontend: `src/app/page.tsx` checks `/api/auth/me` and renders `LoginForm` or `Workspace` (board list, `BoardNav` switcher, and the open board as `KanbanBoard key={boardId}`). `KanbanBoard` loads its board with `GET /api/boards/{id}`, sends each change to its route and replaces local state with the returned board (drag moves are applied first and reverted if the call fails). Keep board mutations pure in `src/lib/kanban.ts` (e.g. `moveCard`: dropping on a column id appends, on a card id inserts at its position). Backend calls go through `src/lib/api.ts` with relative `/api` URLs.
- Backend: all DB access goes through `db.transaction()` (`BEGIN IMMEDIATE`, foreign keys on). Board functions take a `board_id`, check ownership and raise `NotFound` (404). The user and a seeded default board are created on first access.

## Color scheme

Defined as CSS variables in `frontend/src/app/globals.css`; use `var(--...)`, not hex values: `--accent-yellow`, `--primary-blue`, `--secondary-purple` (submit buttons), `--navy-dark` (headings, body text), `--gray-text`, plus `--surface`, `--surface-strong`, `--stroke`, `--shadow`.


## DETAILED PLAN

@docs/PLAN.md