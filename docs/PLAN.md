# Project Plan

Each part has a checklist for the agent to tick off, the tests to write, and the success criteria that must hold before moving on. Parts marked "user sign-off" stop and wait for approval.

## Key decisions

- **Layout:** `frontend/` (Next.js), `backend/` (FastAPI, uv project), `scripts/` (start/stop), `docs/`.
- **Serving:** Next.js static export (`output: "export"`) built into `frontend/out`, copied into the image and served by FastAPI at `/`. All API routes live under `/api`.
- **Container:** multi-stage `Dockerfile` at the project root (Node stage builds the frontend, Python stage runs the backend with uv). `docker-compose.yml` passes `.env` and mounts a volume for the SQLite file. App served on `http://localhost:8000`.
- **Scripts:** `scripts/start.sh` / `scripts/stop.sh` (Mac, Linux) and `scripts/start.ps1` / `scripts/stop.ps1` (Windows), each wrapping `docker compose up -d --build` / `docker compose down`.
- **Auth:** `POST /api/auth/login` checks the hardcoded `user` / `password` and stores the username in a signed session cookie (Starlette `SessionMiddleware`). `POST /api/auth/logout` clears it. `GET /api/auth/me` returns the current user or 401. Board routes require a session.
- **Database:** SQLite through Python's standard `sqlite3`, file path from an env var with a default; tables created on startup if missing. Schema decided in Part 5.
- **AI:** `openai` Python SDK pointed at OpenRouter (`base_url="https://openrouter.ai/api/v1"`), model `openai/gpt-oss-120b`, structured outputs via a JSON schema derived from Pydantic models.
- **Backend tests:** `pytest` with FastAPI `TestClient`, a temp SQLite file per test, and the AI client mocked. Live OpenRouter tests are marked and skipped when `OPENROUTER_API_KEY` is not set.

## Prerequisites

- [x] Docker installed on the dev machine (Colima + Docker CLI via Homebrew).
- [ ] `.env` in the project root containing `OPENROUTER_API_KEY` (needed for the live AI tests and the chat). Not currently present.

---

## Part 1: Plan

Enrich this document with substeps, tests and success criteria for each part. Create `frontend/AGENTS.md` describing the existing code. The user checks and approves the plan.

- [x] Review existing frontend code and tests
- [x] Write `frontend/AGENTS.md`
- [x] Expand this plan with checklists, tests and success criteria
- [x] User reviews and approves the plan (user sign-off)

**Success criteria:** `frontend/AGENTS.md` exists and is accurate; the user has approved this plan.

---

## Part 2: Scaffolding

Docker infrastructure, FastAPI backend, start/stop scripts. Serves a hello world page and an API call.

- [x] `backend/` as a uv project (`pyproject.toml`, `uv.lock`) with `fastapi`, `uvicorn`; dev deps `pytest`, `httpx2`
- [x] `backend/app/main.py`: `GET /api/health` returns `{"status": "ok"}`; static `index.html` hello world served at `/` that calls `/api/health` and shows the result
- [x] Root `Dockerfile` (Python stage only for now) using uv to install deps and run uvicorn on port 8000
- [x] `docker-compose.yml` with `.env` as env file and a named volume for data
- [x] `scripts/start.sh`, `scripts/stop.sh`, `scripts/start.ps1`, `scripts/stop.ps1`
- [x] Update `backend/AGENTS.md` and `scripts/AGENTS.md`; add run instructions to a minimal root `README.md`
- [x] Verify in Docker: `scripts/start.sh` serves the page and API at `http://localhost:8000`, `scripts/stop.sh` stops it

**Tests:** `backend/tests/test_health.py` checks `/api/health` returns 200 and the expected JSON, and `/` returns the HTML page.

**Success criteria:** `scripts/start.sh` builds and starts the container; `http://localhost:8000` shows the hello world page with the API result; `scripts/stop.sh` stops it; `uv run pytest` passes.

---

## Part 3: Add in Frontend

Build the frontend statically and serve it at `/` so the demo Kanban board appears.

- [x] Set `output: "export"` in `next.config.ts`; confirm `npm run build` produces `frontend/out`
- [x] Add a Node build stage to the `Dockerfile`; copy `frontend/out` into the Python image
- [x] FastAPI mounts the static export at `/` (after `/api` routes) with `html=True`; remove the hello world page
- [x] Add card editing (edit title and details of an existing card), which the requirements call for but the demo lacks
- [x] Point a Playwright config or project at the container (`http://localhost:8000`) in addition to the dev server (`E2E_BASE_URL`)
- [x] Verify in Docker: the board loads at `http://localhost:8000` after `scripts/start.sh` (all e2e tests pass against the container)

**Tests:** existing unit and e2e tests still pass; new unit and e2e tests for editing a card; backend test that `/` serves `index.html` and `/api/health` still works with static files mounted.

**Success criteria:** after `scripts/start.sh`, `http://localhost:8000` shows the Kanban board with all demo features working, including card editing; all tests pass.

---

## Part 4: Fake user sign in

On first visit to `/`, the user must log in with `user` / `password` to see the board, and can log out.

- [x] Backend: `SessionMiddleware` with a secret from env (dev default); `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`
- [x] Frontend: on load call `/api/auth/me`; show a login form if 401, otherwise the board
- [x] Login form with error message on bad credentials; logout button in the board header
- [x] Next.js dev server proxies or rewrites `/api` to the backend so local dev works

**Tests:** backend tests for login success, login failure (401), `me` with and without session, logout clears session. Frontend unit tests for the login form (submit, error state) and logout. E2E: login required, wrong password shows error, successful login shows board, logout returns to login.

**Success criteria:** the board is not visible without logging in; correct credentials show it; logout works and survives a page reload; all tests pass.

---

## Part 5: Database modeling (user sign-off)

Propose a schema for the Kanban, save it as JSON, document the approach, get sign-off.

- [x] Draft schema covering users, one board per user, columns (ordered, renamable), cards (ordered within column, title, details)
- [x] Save as `docs/schema.json`
- [x] Write `docs/DATABASE.md`: tables, relationships, ordering approach, how the DB is created on first run, how the default board is seeded for a new user
- [x] User reviews and approves the schema (user sign-off; new boards seeded with the demo cards)

**Success criteria:** user has approved `docs/schema.json` and `docs/DATABASE.md`.

---

## Part 6: Backend API

API routes to read and change a user's Kanban, persisted in SQLite.

- [x] `backend/app/db.py`: connect, create tables if missing, seed `user` and their default board
- [x] Routes (all require a session): get board; rename column; create card; update card; delete card; move card (target column and position)
- [x] Pydantic request/response models matching the frontend `BoardData` shape
- [x] Return 404 for ids not belonging to the current user

**Tests:** DB created from scratch on a fresh path; seed board present; each route's happy path; ordering correct after moves within and across columns; 401 without session; 404 for unknown ids; data persists across app restarts using the same file.

**Success criteria:** all backend tests pass; the DB file is created automatically if absent.

---

## Part 7: Frontend + Backend

The frontend uses the backend API so the board is persistent.

- [x] `src/lib/api.ts` with typed functions for each board route
- [x] Load the board from the API after login instead of `initialData`
- [x] Each action (rename, add, edit, delete, move) calls the API; update local state from the response (moves show immediately and revert if the call fails)
- [x] Simple loading state and a visible error message if a call fails

**Tests:** unit tests with `fetch` mocked for load and each action. E2E against the container: changes persist after reload for add, edit, delete, rename and move; data persists after `stop.sh` and `start.sh`.

**Success criteria:** every board change survives a page reload and a container restart; all tests pass.

---

## Part 8: AI connectivity

The backend can call OpenRouter.

- [x] Add `openai` dependency; `backend/app/ai.py` builds a client from `OPENROUTER_API_KEY`
- [x] Temporary or internal route/function that sends "What is 2+2?" and returns the reply (`ai.ask`)
- [ ] Live test passes outside and inside the container (needs `.env`)

**Tests:** unit test with the client mocked; live test (skipped without key) asserting the reply contains "4".

**Success criteria:** the live test passes inside and outside the container.

---

## Part 9: AI with board context and structured outputs

Each AI call includes the board JSON, the user's message and the conversation history. The AI replies with structured output: a message for the user and an optional board update.

- [x] Pydantic models for the AI response: `message: str` and an optional list of operations (create card, update card, move card, delete card, rename column)
- [x] System prompt explaining the board format and the operations
- [x] `POST /api/chat` taking the message and history; returns the AI message and the updated board if anything changed
- [x] Apply operations through the same DB functions the board routes use, in one transaction; reject invalid ids without partial changes
- [ ] Live chat test passes (needs `.env`)

**Tests:** mocked AI responses covering no-op reply, each operation type, multiple operations in one reply, and invalid operations (no changes applied). Live test (skipped without key): asking to create a card results in a new card in the DB.

**Success criteria:** the AI can create, edit, move and delete one or more cards via chat; invalid output never corrupts the board; all tests pass.

---

## Part 10: AI chat sidebar

A sidebar chat widget in the UI. When the AI changes the board, the board refreshes automatically.

- [x] Sidebar component with message list, input and send button (purple submit), using the project color scheme
- [x] Conversation history kept in frontend state and sent with each message
- [x] Loading indicator while waiting for the AI; error message on failure
- [x] When the response includes a board update, replace the board state with it
- [ ] Manual check with the live model (needs `.env`)

**Tests:** unit tests for sending a message, rendering replies, loading and error states, and board refresh on update (API mocked). E2E with the chat route mocked: a message that creates a card shows the card on the board without reload. Manual check with the live model.

**Success criteria:** a user can chat with the AI in the sidebar and see card changes made by the AI appear immediately; all tests pass.

---

# Phase 2: Full project management app

Goal: grow the MVP into a multi-user, multi-board project management app. Each part keeps the app working, ships with tests (backend pytest, frontend Vitest, Playwright e2e), and updates the docs. Existing databases (the Docker volume holds real data) are upgraded by numbered migrations, never by deleting the file.

## Part 11: Schema migrations and user accounts

- [x] Migrations: `PRAGMA user_version` plus an ordered list of migration scripts in `db.py`, applied on startup in one transaction each; fresh and existing DBs go through the same path
- [x] Migration 1: `users.password_hash`
- [x] Password hashing with stdlib `hashlib.scrypt` (random salt, constant-time compare); no new dependency
- [x] Demo account `user` / `password` kept (created or given its password on startup) so existing sign-ins and tests still work
- [x] Routes: register, login (checks the hash), logout, me, change password, delete account. Session stores the user id; a deleted user's session gets 401
- [x] Frontend: sign-up mode on the login form; account dialog (signed-in name, change password, delete account)

**Tests:** migrations on a fresh DB and on a v0 DB with data (data kept); hashing; each auth route including duplicates, wrong passwords, validation, deleted user; frontend sign-up and account dialog; e2e register, sign out and back in, change password.

## Part 12: Multiple boards per user

- [x] Migration 2: boards get a `title` and lose `UNIQUE(user_id)`; the existing board keeps its data
- [x] Routes scoped by board: `GET/POST /api/boards`, `PATCH/DELETE /api/boards/{id}`, and board, column, card and chat routes under `/api/boards/{id}/...`; other users' boards are 404
- [x] New boards get the default columns (no demo cards); a new user gets one seeded board; the last board cannot be deleted (409)
- [x] Frontend: board switcher (list, create, rename, delete), remembers the last board

**Tests:** ownership and isolation between users and boards, CRUD, deleting a board removes its cards; e2e create and switch boards.

## Part 13: Richer cards

- [x] Migration 3: cards get `priority` (none/low/medium/high), `due_date` (ISO date or null) and `labels` (list of short strings)
- [x] Shown on cards (priority badge, due date with overdue highlight, label chips) and editable in the card form
- [x] AI operations and prompt updated for the new fields (the prompt also gets today's date)
- [x] Card updates are partial (only the fields sent change; `dueDate: null` clears it)

## Part 14: Column management

- [x] Add, delete (moving its cards to another column or deleting them) and reorder columns; at least one column per board (and at most 20)
- [x] AI can add and rename columns (deleting and reordering stay with the user)

## Part 15: Search, filters and overview

- [x] Filter the board by text, priority, label and overdue; clear filters (frontend only: the board is already loaded whole)
- [x] Board summary: total, overdue, due in 7 days, high priority (cards per column are in each column header, "N of M" while filtering)

## Part 16: Hardening and polish

- [x] Coverage measured and enforced: backend `uv run pytest --cov=app` (line and branch, fails under 95%; at 100% lines, 99.7% with branches), frontend `npm run test:coverage` (fails under 95% statements and lines, 90% branches and functions; at 99.6% statements, 98.3% branches)
- [x] Gaps closed: drag-end logic extracted to the pure `planMove`; drag handlers tested with a stand-in `DndContext`; auth API wrappers, drag preview, failure branches, migration foreign-key check
- [x] Review fixes: a failed column rename now shows the saved title again (the input stayed on the rejected text); chat message (4000) and history (latest 40 turns) are capped on both sides; entered passwords are capped at 128 characters before hashing

## Part 17: Sharing boards

- [x] Migration 4: `board_members (board_id, user_id)`; the owner stays `boards.user_id`
- [x] Members can open and change the board's content and use its chat; only the owner renames or deletes the board and manages members (403 for members, 404 for everyone else)
- [x] Routes: list members; owner adds a member by username; owner removes a member, or a member leaves
- [x] The board list includes shared boards with their owner; "at least one board" counts owned boards
- [x] Frontend: shared boards marked in the switcher; a Share dialog (members, add by username, remove, leave); owner-only actions hidden for members

## Part 18: Card comments and activity

- [x] Comments on cards (author, time, text); delete own comments
- [x] Board activity log (card created, moved, edited, deleted; column and member changes; comments; AI changes marked "via the AI assistant"), newest first, latest 100

## Part 19: Checklists

- [x] Checklist items on cards (text, done; at most 50), progress shown on the card; own table and per-item routes so people ticking different items of a shared card never overwrite each other; ticking shows at once and reverts if saving fails; logged as activity; the AI sees checklists but does not change them

## Part 20: Final review

- [x] Password hashing moved out of write transactions (change password and delete account held the database write lock for the length of scrypt)
- [x] Usernames ignore case (migration 7): no "Alice" and "alice" as separate accounts, which sharing by name would confuse; sign-in and member lookups match any case
- [x] Sign-in trims the username and shows the registered spelling
- [x] README lists the features
