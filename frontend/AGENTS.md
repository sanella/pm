# Frontend

Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, `@dnd-kit` for drag and drop. Currently a frontend-only demo: all board state lives in React state and resets on reload.

## Commands

```bash
npm install
npm run dev          # http://localhost:3000
npm run build
npm run lint
npm run test:unit    # Vitest + Testing Library (jsdom), src/**/*.test.{ts,tsx}
npm run test:e2e     # Playwright (chromium), tests/*.spec.ts; starts dev server on 127.0.0.1:3000
npm run test:all     # unit then e2e
```

## Structure

- `src/app/layout.tsx` - root layout; loads fonts (Space Grotesk as `--font-display`, Manrope as `--font-body`).
- `src/app/page.tsx` - renders `KanbanBoard`.
- `src/app/globals.css` - color scheme as CSS variables (`--accent-yellow`, `--primary-blue`, `--secondary-purple`, `--navy-dark`, `--gray-text`) plus `--surface`, `--surface-strong`, `--stroke`, `--shadow`. Components use these via `var(--...)`.
- `src/lib/kanban.ts` - data model and pure logic:
  - `BoardData = { columns: Column[]; cards: Record<string, Card> }`; `Column = { id, title, cardIds }`; `Card = { id, title, details }`. Card order lives in each column's `cardIds`.
  - `initialData` - seed board: 5 columns (Backlog, Discovery, In Progress, Review, Done), 8 cards.
  - `moveCard(columns, activeId, overId)` - reorder within a column or move across columns. Dropping on a column id appends; dropping on a card id inserts at that card's position.
  - `createId(prefix)` - random id for new cards.
- `src/components/`
  - `KanbanBoard.tsx` - client component owning board state (`useState`), `DndContext`, and handlers for rename column, add card, delete card, drag end. Renders header and the five columns.
  - `KanbanColumn.tsx` - droppable column; title is an inline input (rename); renders cards in a `SortableContext` and `NewCardForm`.
  - `KanbanCard.tsx` - sortable card with a Remove button.
  - `KanbanCardPreview.tsx` - card rendered in the `DragOverlay` while dragging.
  - `NewCardForm.tsx` - toggleable form to add a card (title required, details optional).

## Tests

- `src/lib/kanban.test.ts` - `moveCard` reorder, cross-column move, drop on column.
- `src/components/KanbanBoard.test.tsx` - renders 5 columns, rename column, add and remove card.
- `tests/kanban.spec.ts` - e2e: board loads, add card, drag card between columns.

## Test hooks

- Columns: `data-testid="column-<columnId>"`; cards: `data-testid="card-<cardId>"`.
- Column title input: `aria-label="Column title"`; delete button: `aria-label="Delete <card title>"`.

## Known gaps

- Cards cannot be edited after creation (only added and removed).
- No persistence, no auth, no API calls.
- Not yet configured for static export.
