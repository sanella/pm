# Code Review

Date: 2026-10-31. Scope: whole repository at Part 6 (branch `pm-Step-4` plus uncommitted Parts 5-6).

## Summary

The codebase is small, readable and consistent, and the test suite is healthy: 36 backend tests, 15 unit tests and 8 e2e tests all pass, and lint is clean. Board logic is kept in pure functions (`frontend/src/lib/kanban.ts`, `backend/app/db.py`), ownership checks are applied on every board route, and the API returns the same shape the frontend already uses.

The most important findings are:

1. The Docker setup has never been built or run (Docker is not installed), so the actual deliverable is unverified.
2. The session cookie is signed with a hardcoded default secret that the container also uses.
3. Database reads inside a change run outside the transaction, so concurrent changes can corrupt card order.
4. The frontend shows a permanently blank page if the backend is unreachable.

Severity: **High** = can break the app or its security; **Medium** = real bug or risk under realistic conditions; **Low** = cleanup, polish or future-proofing.

## Findings

### High

**H1. Docker build and scripts are unverified**
`Dockerfile`, `docker-compose.yml`, `scripts/*`. Docker is not installed, so none of the Part 2/3 Docker steps have run. The running app has only been tested via `uv` directly. Problems such as the Google Fonts download during `next build`, `npm ci` inside `node:24-slim`, or uv paths in the image would only show up there.

**H2. Session secret defaults to a public value**
`backend/app/main.py:24`. `SESSION_SECRET` falls back to `"dev-secret-change-me"`, which is in the repo, and `docker-compose.yml` does not set it. Anyone who knows the default can forge a `session` cookie for any username and bypass login. Low exposure while the app only runs on localhost, but the fallback should not be what the container uses.

### Medium

**M1. Reads inside a change are not isolated**
`backend/app/db.py:72` (`transaction`). Python's `sqlite3` (legacy transaction mode) only opens a transaction at the first INSERT/UPDATE/DELETE. Verified: `conn.in_transaction` is `False` after a SELECT and `True` after an INSERT. In `move_card`, `delete_card` and `create_card` the card order is read before any write, so two concurrent changes to the same column can both read the old order and write conflicting positions (duplicate or missing positions). Rollback of failed changes still works, because no write has happened yet when the checks fail.

**M2. First board access can race**
`backend/app/db.py:88` (`get_or_create_board_id`). Two first requests at the same time both see no board and both insert one; the second violates `UNIQUE(user_id)` and returns a 500. This becomes reachable once the frontend loads the board (Part 7). Fixed by the same change as M1 (serialize the transaction).

**M3. Blank page when the backend is down**
`frontend/src/app/page.tsx:13`. `getCurrentUser().then(setUser)` has no error handling. If `fetch` fails (backend not running, network error), the promise rejects, `user` stays `undefined`, and the page renders `null` forever with only a console error.

**M4. Login errors are unhandled and double submit is possible**
`frontend/src/components/LoginForm.tsx:15`. A network failure in `login()` throws inside the submit handler: no message is shown and the rejection is unhandled. There is no "submitting" state, so repeated clicks send several requests.

**M5. Column rename fires on every keystroke and allows empty titles**
`frontend/src/components/KanbanColumn.tsx:46`. `onChange` calls `onRename` per keystroke. Harmless while state is local, but in Part 7 this becomes one API request per character, with out-of-order responses able to overwrite newer text. An empty title is also accepted in the UI, which the backend now rejects with 422.

**M6. Whitespace-only titles pass backend validation**
`backend/app/models.py:29-39`. `Field(min_length=1)` accepts `" "`. The frontend trims input, but the API (and the AI in Part 9) can store blank-looking cards and columns. There is also no maximum length on titles or details.

**M7. Keyboard users cannot move cards, and cards nest interactive elements**
`frontend/src/components/KanbanBoard.tsx` (sensors), `KanbanCard.tsx`. Only `PointerSensor` is registered, so cards cannot be moved with the keyboard. dnd-kit's attributes also give each card `role="button"` while it contains Edit and Remove buttons (nested interactive controls), which screen readers handle poorly.

### Low

**L1. DB path depends on the working directory**
`backend/app/db.py:61`. `DB_PATH` defaults to the relative `data/pm.db`, so starting uvicorn from the repo root instead of `backend/` silently creates a second, empty database in `pm/data/`. Anchor the default to the backend directory.

**L2. Test artifact tracked in git**
`frontend/test-results/.last-run.json` is committed although `test-results` is generated output. It changes on every e2e run.

**L3. Unit test mocks are not reset between tests**
`frontend/vitest.config.ts`. No `mockReset`/`restoreMocks`, so call counts and resolved values from `vi.mocked(...)` carry across tests. `page.test.tsx` only passes `toHaveBeenCalledOnce` because a single test calls `logout`.

**L4. E2E tests will share the dev database from Part 7**
`frontend/playwright.config.ts`. The backend webServer uses the default `data/pm.db` and `reuseExistingServer: true`. Once the frontend persists changes, e2e runs will modify the developer's board and depend on its state. Give e2e its own temporary `DB_PATH`.

**L5. Read requests run a write-style transaction**
`backend/app/main.py:89`. `read_board` goes through `change_board` with a no-op change. Correct, but the name and lambda make the read path look like a write; a small `load_board` helper would read more clearly.

**L6. Inconsistent field naming in the API**
`backend/app/models.py`. Responses use `cardIds` (camelCase, matching the frontend) while requests use `column_id` (snake_case). Pick one convention before the frontend starts calling these routes.

**L7. Leftovers in the frontend**
- `KanbanBoard.tsx`: `const cardsById = useMemo(() => board.cards, [board.cards])` adds nothing.
- `KanbanColumn.tsx`: "1 cards" (no singular form).
- `lib/kanban.ts`: `createId` uses `Math.random`; it becomes unnecessary once the backend generates IDs (Part 7).

**L8. Container hardening**
`Dockerfile`: the app runs as root, and there is no `HEALTHCHECK` and no `restart` policy in compose. Acceptable for a local MVP; easy to add.

**L9. Local Node version differs from Docker**
The Mac has Node 26 (Homebrew); the image uses Node 24 LTS. Playwright's browser install hung under Node 26 (worked under Node 22), so local tooling is on an untested major version.

**L10. Outdated text in docs**
- Root `AGENTS.md` "Starting Point" still describes a frontend-only demo.
- `frontend/README.md` duplicates `frontend/AGENTS.md` and does not mention the backend the dev server now needs.

## Test coverage gaps

- `moveCard` (`lib/kanban.ts`) with unknown IDs, and dropping a card onto itself.
- `NewCardForm` and card edit with an empty or whitespace title.
- Frontend behaviour when API calls fail (M3, M4).
- Backend: whitespace titles (M6), concurrent changes (M1, M2), very long input.

## Action plan

| # | Action | Fixes | Priority | When |
|---|---|---|---|---|
| 1 | Install Docker, run `scripts/start.sh` / `stop.sh`, confirm login and board at `http://localhost:8000`, tick the Part 2/3 Docker boxes | H1 | High | Now |
| 2 | Require `SESSION_SECRET` from `.env` in Docker (no public fallback); keep the dev default only for local `uv run`, or generate a random secret at startup when unset | H2 | High | Now |
| 3 | Open transactions with `BEGIN IMMEDIATE` (e.g. `isolation_level=None` plus explicit `BEGIN IMMEDIATE`/`COMMIT`/`ROLLBACK` in `transaction()`); add a test that two interleaved moves keep positions 0..n-1 | M1, M2 | Medium | Before Part 7 |
| 4 | Catch errors in `page.tsx` session check and show a "cannot reach server" message with a retry | M3 | Medium | Part 7 |
| 5 | Add a submitting state and try/catch to `LoginForm`; show a network error message | M4 | Medium | Part 7 |
| 6 | Save column titles on blur or Enter (not per keystroke); ignore empty titles | M5 | Medium | Part 7 |
| 7 | Strip and validate titles in the request models (Pydantic `StringConstraints(strip_whitespace=True, min_length=1, max_length=...)`), and set a max length for details | M6 | Medium | Before Part 9 |
| 8 | Add dnd-kit `KeyboardSensor` with `sortableKeyboardCoordinates`; move drag listeners to a drag handle so card buttons are not nested in a `role="button"` | M7 | Medium | Part 7 or 10 |
| 9 | Pass a temp `DB_PATH` to the e2e backend webServer and stop reusing an existing backend | L4 | Low | Part 7 |
| 10 | Agree on one field-naming convention for API bodies (e.g. `columnId` via Pydantic aliases, or `card_ids` mapped in `api.ts`) | L6 | Low | Part 7 |
| 11 | Anchor default `DB_PATH` to the backend directory | L1 | Low | Any time |
| 12 | `git rm --cached frontend/test-results/.last-run.json` | L2 | Low | Any time |
| 13 | Add `mockReset: true` to `vitest.config.ts` | L3 | Low | Any time |
| 14 | Replace the no-op `change_board` call in `read_board` with a read helper | L5 | Low | Any time |
| 15 | Remove `cardsById` memo, fix "1 cards", drop `createId` once IDs come from the backend | L7 | Low | Part 7 |
| 16 | Run as a non-root user, add `HEALTHCHECK` and `restart: unless-stopped` | L8 | Low | After action 1 |
| 17 | Switch local Node to 24 LTS (`brew install node@24`) | L9 | Low | Any time |
| 18 | Update root `AGENTS.md` "Starting Point" and trim `frontend/README.md` | L10 | Low | Any time |
| 19 | Add the missing tests listed under "Test coverage gaps" alongside the fixes above | Coverage | Low | With each fix |

## Resolution (2026-10-31)

All findings were addressed and verified.

| Finding | Resolution |
|---|---|
| H1 | Installed Colima + Docker CLI. `scripts/start.sh` builds and starts the container, waits for `/api/health`, and all e2e tests pass against it; `scripts/stop.sh` stops it. Data persisted across two `down`/`up` cycles. The `.sh` scripts fall back to `docker-compose` when the `docker compose` plugin is missing. |
| H2 | No public fallback: without `SESSION_SECRET` a random key is generated at startup. `.env` is loaded by compose; README documents the setting. |
| M1, M2 | `db.transaction()` now uses `isolation_level=None` with explicit `BEGIN IMMEDIATE`/`COMMIT`/`ROLLBACK`. New tests: reads are inside the transaction, 80 concurrent moves keep positions 0..n-1, 16 concurrent first accesses create one board. All three fail against the old code. |
| M3 | `page.tsx` shows "Cannot reach the server" with a Retry button. |
| M4 | `LoginForm` disables the button while submitting and shows a network error message. |
| M5 | Column titles save on blur or Enter; blank titles revert. |
| M6 | Request titles are stripped, 1-200 characters; details stripped, at most 2000. |
| M7 | dnd-kit `KeyboardSensor` added. Keyboard drags start from a labelled grip handle that carries the sortable attributes, so cards are no longer `role="button"` around other buttons; mouse drags still start anywhere on the card. (A first version moved mouse dragging onto the handle too, which broke dragging by the card body; fixed and covered by e2e tests.) New e2e tests: keyboard move, drag by card body across and within columns, Space on Edit opens the editor. |
| L1 | Default `DB_PATH` is `backend/data/pm.db` regardless of the working directory. |
| L2 | `test-results/` untracked and ignored (also `playwright-report/`). |
| L3 | `mockReset: true` in `vitest.config.ts`. |
| L4 | e2e starts its own backend (:8001, temp DB) and dev server (:3001) and never reuses running servers; `next.config.ts` reads `API_URL`. |
| L5 | `read_board` reads directly in a transaction. |
| L6 | All API JSON is camelCase (`CamelModel` with `to_camel` aliases), e.g. `columnId`. |
| L7 | Removed the `cardsById` memo; "1 card" / "n cards". `createId` stays until IDs come from the backend in Part 7. |
| L8 | Image runs as non-root `app` user from the venv, with a `HEALTHCHECK`; compose uses `restart: unless-stopped`. |
| L9 | Local Node switched to 24 LTS (`node@24`, same major as the Docker image). |
| L10 | Root `AGENTS.md` "Starting Point" updated; `frontend/README.md` points to `AGENTS.md` and the backend. |
| Extra | `tsc --noEmit` failed on all test files (pre-existing): `src/test/vitest.d.ts` referenced `vitest` instead of `vitest/globals`. Fixed; type check is clean. |
| Coverage | Added tests for every gap listed above. |

Final test run: lint clean, type check clean, 26 unit tests, 44 backend tests, 12 e2e tests against isolated dev servers and 12 e2e tests (x3) against the Docker container, all passing.
