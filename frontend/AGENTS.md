# Frontend

Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, `@dnd-kit` for drag and drop. Built as a static export (`output: "export"` in `next.config.ts`, output in `out/`) which the backend serves at `/`. Sign-in and the board both go through the backend API; every board change is saved.

## Commands

```bash
npm install
npm run dev          # http://localhost:3000; proxies /api to the backend on :8000, so run the backend too
npm run build        # static export to out/
npm run lint
npm run test:unit    # Vitest + Testing Library (jsdom), src/**/*.test.{ts,tsx}
npm run test:e2e     # Playwright (chromium), tests/*.spec.ts; starts its own backend (:8001, temp DB) and dev server (:3001)
npm run test:all     # unit then e2e
E2E_BASE_URL=http://localhost:8000 npx playwright test   # e2e against an already running app (backend build or Docker); starts no servers
```

## Structure

- `src/app/layout.tsx` - root layout; loads fonts (Space Grotesk as `--font-display`, Manrope as `--font-body`).
- `src/app/page.tsx` - client component: checks `/api/auth/me` on load, then renders `LoginForm` (signed out) or `KanbanBoard` (signed in); shows "Cannot reach the server" with a Retry button if the check fails; handles logout.
- `next.config.ts` - `output: "export"`; in development only, rewrites `/api/*` to `API_URL` (default `http://127.0.0.1:8000`). Rewrites do not apply to the export, where the backend serves both.
- `src/lib/api.ts` - fetch wrappers for the backend: `getCurrentUser`, `login`, `logout`, and the board routes `getBoard`, `renameColumn`, `createCard`, `updateCard`, `deleteCard`, `moveCard` (each returns the full updated `BoardData` and throws if the response is not ok). All calls use relative `/api` URLs.
- `src/app/globals.css` - color scheme as CSS variables (`--accent-yellow`, `--primary-blue`, `--secondary-purple`, `--navy-dark`, `--gray-text`) plus `--surface`, `--surface-strong`, `--stroke`, `--shadow`. Components use these via `var(--...)`.
- `src/lib/kanban.ts` - data model and pure logic:
  - `BoardData = { columns: Column[]; cards: Record<string, Card> }`; `Column = { id, title, cardIds }`; `Card = { id, title, details }`. Card order lives in each column's `cardIds`.
  - `initialData` - sample board (5 columns, 8 cards) used as test data; the real board comes from the backend.
  - `moveCard(columns, activeId, overId)` - reorder within a column or move across columns. Dropping on a column id appends; dropping on a card id inserts at that card's position.
  - `findCardPosition(columns, cardId)` - `{ columnId, position }` of a card, as the backend move route expects; used after `moveCard` to build the move request.
- `src/components/`
  - `KanbanBoard.tsx` - client component owning board state, `DndContext` (pointer and keyboard sensors), and handlers for rename column, add, edit and delete card, drag end. Loads the board on mount ("Loading board..." until then, or an error with a Log out button). Each handler calls the API through `save()`, which replaces the board with the response, or restores the previous board and shows an error (`role="alert"`) if the call fails. Drag end applies `moveCard` locally first so the card does not jump back during the request. Renders header (with Log out button, `onLogout` prop) and the five columns.
  - `LoginForm.tsx` - username/password form; disables the button while submitting; shows an error (`role="alert"`) for bad credentials or an unreachable server.
  - `KanbanColumn.tsx` - droppable column; title is an uncontrolled inline input saved on blur or Enter (blank reverts; `key={column.title}` resets it when the saved title changes); renders cards in a `SortableContext` and `NewCardForm`.
  - `KanbanCard.tsx` - sortable card. Mouse/touch: drag from anywhere on the card (pointer listeners on the card). Keyboard: a grip handle button (`aria-label="Drag <title>"`) carries the sortable attributes and the keyboard listener, so the card itself is not a `role="button"` around the Edit and Remove buttons, and Space/Enter on those buttons still click them. Focus the handle, Space to pick up, arrow keys to move, Space to drop. Edit switches to an inline form and disables dragging.
  - `KanbanCardPreview.tsx` - card rendered in the `DragOverlay` while dragging.
  - `NewCardForm.tsx` - toggleable form to add a card (title required, details optional).

## Tests

- Vitest runs with `mockReset: true`, so set mock return values in each test.
- `src/lib/kanban.test.ts` - `moveCard` reorder, cross-column move, drop on column, unknown ids, drop on itself; `findCardPosition`.
- `src/lib/api.test.ts` - each board function calls its route with the right method and body (`fetch` stubbed); errors throw.
- `src/components/KanbanBoard.test.tsx` - with `fetch` stubbed (`respond(board)` queues a response): load, loading state, load error, rename column (blank reverts without a request), add, delete and edit card, blank title and blank edit send nothing, cancel edit, failed save shows an error and keeps the board, card counts, drag handle, logout callback. Drag moves are covered by e2e.
- `src/components/LoginForm.test.tsx` - successful login, invalid credentials, unreachable server, disabled while submitting (`@/lib/api` mocked).
- `src/app/page.test.tsx` - login form when signed out, unreachable server, board when signed in, login then board, logout then login form (`@/lib/api` mocked, including `getBoard`). Wait for the board heading before clicking Log out: the loading state has its own Log out button that the loaded board replaces.
- `tests/kanban.spec.ts` - e2e (signs in first via `tests/helpers.ts`): board loads; add, delete, edit card, rename column, drag between columns and within a column (by the card body), each checked again after a reload; keyboard move; Space on Edit opens the editor. The board is shared server state (and the user's real board when run against the container), so each test creates uniquely titled cards (`uniqueTitle`), removes them at the end, and restores a renamed column. Ids are random, so columns are found by position and cards by title (or by `data-testid` once found, since a card in edit mode has no title text). Wait for the `/move` response before reloading after a drag, since moves are applied before the request finishes. Run repeats with `--workers 1` (`--repeat-each` runs copies of a test in parallel on the same board). An arrow key pressed right after pickup is sometimes ignored while dnd-kit measures drop targets, so the keyboard test presses again (`toPass`) until the announcement shows a new target. Keyboard drags must wait for dnd-kit's live region (`[id^="DndLiveRegion"]`) to announce each step (pickup, new target) before pressing the next key; otherwise keys can be lost.
- `tests/auth.spec.ts` - e2e: login required, wrong password error, session survives reload, logout survives reload.
- Next.js renders its own empty `role="alert"` route announcer, so filter `getByRole("alert")` by text in e2e tests.

## Test hooks

- Columns: `data-testid="column-<columnId>"`; cards: `data-testid="card-<cardId>"`.
- Column title input: `aria-label="Column title"`; card buttons: `aria-label="Drag <card title>"`, `aria-label="Edit <card title>"`, `aria-label="Delete <card title>"`; edit inputs: `aria-label="Edit card title"`, `aria-label="Edit card details"`.
