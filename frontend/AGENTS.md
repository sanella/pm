# Frontend

Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, `@dnd-kit` for drag and drop. Built as a static export (`output: "export"` in `next.config.ts`, output in `out/`) which the backend serves at `/`. Sign-in is checked against the backend; board state still lives in React state and resets on reload.

## Commands

```bash
npm install
npm run dev          # http://localhost:3000; proxies /api to the backend on :8000, so run the backend too
npm run build        # static export to out/
npm run lint
npm run test:unit    # Vitest + Testing Library (jsdom), src/**/*.test.{ts,tsx}
npm run test:e2e     # Playwright (chromium), tests/*.spec.ts; starts the backend (:8000, via uv) and dev server (:3000)
npm run test:all     # unit then e2e
E2E_BASE_URL=http://localhost:8000 npx playwright test   # e2e against the backend-served build (no dev server started)
```

## Structure

- `src/app/layout.tsx` - root layout; loads fonts (Space Grotesk as `--font-display`, Manrope as `--font-body`).
- `src/app/page.tsx` - client component: checks `/api/auth/me` on load, then renders `LoginForm` (signed out) or `KanbanBoard` (signed in); handles logout.
- `next.config.ts` - `output: "export"`; in development only, rewrites `/api/*` to `http://127.0.0.1:8000` (rewrites do not apply to the export, where the backend serves both).
- `src/lib/api.ts` - fetch wrappers for the backend: `getCurrentUser`, `login`, `logout`. All calls use relative `/api` URLs.
- `src/app/globals.css` - color scheme as CSS variables (`--accent-yellow`, `--primary-blue`, `--secondary-purple`, `--navy-dark`, `--gray-text`) plus `--surface`, `--surface-strong`, `--stroke`, `--shadow`. Components use these via `var(--...)`.
- `src/lib/kanban.ts` - data model and pure logic:
  - `BoardData = { columns: Column[]; cards: Record<string, Card> }`; `Column = { id, title, cardIds }`; `Card = { id, title, details }`. Card order lives in each column's `cardIds`.
  - `initialData` - seed board: 5 columns (Backlog, Discovery, In Progress, Review, Done), 8 cards.
  - `moveCard(columns, activeId, overId)` - reorder within a column or move across columns. Dropping on a column id appends; dropping on a card id inserts at that card's position.
  - `createId(prefix)` - random id for new cards.
- `src/components/`
  - `KanbanBoard.tsx` - client component owning board state (`useState`), `DndContext`, and handlers for rename column, add, edit and delete card, drag end. Renders header (with Log out button, `onLogout` prop) and the five columns.
  - `LoginForm.tsx` - username/password form; shows an error (`role="alert"`) on failed login.
  - `KanbanColumn.tsx` - droppable column; title is an inline input (rename); renders cards in a `SortableContext` and `NewCardForm`.
  - `KanbanCard.tsx` - sortable card with Edit and Remove buttons. Edit switches to an inline form; while editing, dragging is disabled and the sortable attributes/listeners are not applied (otherwise the card becomes an `aria-disabled` button around the inputs).
  - `KanbanCardPreview.tsx` - card rendered in the `DragOverlay` while dragging.
  - `NewCardForm.tsx` - toggleable form to add a card (title required, details optional).

## Tests

- `src/lib/kanban.test.ts` - `moveCard` reorder, cross-column move, drop on column.
- `src/components/KanbanBoard.test.tsx` - renders 5 columns, rename column, add and remove card, edit card, cancel edit, logout callback.
- `src/components/LoginForm.test.tsx` - successful login, error on invalid credentials (`@/lib/api` mocked).
- `src/app/page.test.tsx` - login form when signed out, board when signed in, login then board, logout then login form (`@/lib/api` mocked).
- `tests/kanban.spec.ts` - e2e (signs in first via `tests/helpers.ts`): board loads, add card, drag card between columns, edit card.
- `tests/auth.spec.ts` - e2e: login required, wrong password error, session survives reload, logout survives reload.
- Next.js renders its own empty `role="alert"` route announcer, so filter `getByRole("alert")` by text in e2e tests.

## Test hooks

- Columns: `data-testid="column-<columnId>"`; cards: `data-testid="card-<cardId>"`.
- Column title input: `aria-label="Column title"`; card buttons: `aria-label="Edit <card title>"`, `aria-label="Delete <card title>"`; edit inputs: `aria-label="Edit card title"`, `aria-label="Edit card details"`.

## Known gaps

- No persistence: the board resets on reload.
