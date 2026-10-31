# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Project overview

A Project Management MVP: a single-user Kanban board web app with an AI chat sidebar. The user signs in (hardcoded `user` / `password`), sees one Kanban board with fixed, renamable columns, and can add, edit, delete, and drag-and-drop cards. The AI assistant in the sidebar can create, edit, and move one or more cards. The database supports multiple users for the future, but the MVP has one board per user and runs locally in Docker.

## Color scheme

Defined as CSS variables in `frontend/src/app/globals.css`. Use the variables, not hard-coded hex values.

| Role | Hex | CSS variable | Usage |
|---|---|---|---|
| Accent Yellow | `#ecad0a` | `--accent-yellow` | Accent lines, highlights |
| Blue Primary | `#209dd7` | `--primary-blue` | Links, key sections |
| Purple Secondary | `#753991` | `--secondary-purple` | Submit buttons, important actions |
| Dark Navy | `#032147` | `--navy-dark` | Main headings, body text |
| Gray Text | `#888888` | `--gray-text` | Supporting text, labels |

Supporting tokens: `--surface` (`#f7f8fb`, page background), `--surface-strong` (`#ffffff`), `--stroke` (navy at 8% opacity, borders), `--shadow`.

## Current state

The backend (`backend/`, see `backend/AGENTS.md`) serves `/api/health` and the frontend static export at `/`; sign-in (`user` / `password`) is enforced via a session cookie; the board itself is still client-side only (no persistence yet). Packaged by the root `Dockerfile` and `docker-compose.yml` and started with `scripts/start.sh`. Work proceeds part by part according to `docs/PLAN.md` (Parts 1-10). Read it before starting work and check off its steps as they complete. Parts 1 and 5 require explicit user sign-off before moving on.

## Frontend commands (run from `frontend/`)

```bash
npm install
npm run dev                     # Next.js dev server on :3000; proxies /api to the backend on :8000
npm run build                   # static export to frontend/out
npm run lint
npm run test:unit               # Vitest (jsdom), src/**/*.test.{ts,tsx}
npx vitest run src/lib/kanban.test.ts          # single unit test file
npx vitest run -t "test name"                  # single test by name
npm run test:e2e                # Playwright (tests/), auto-starts backend (:8000) and dev server (:3000)
npx playwright test tests/kanban.spec.ts -g "test name"
```

## Frontend architecture

- Next.js 16 App Router, React 19, Tailwind CSS 4, `@dnd-kit` for drag and drop. Path alias `@/` maps to `frontend/src/`.
- `src/app/page.tsx` renders `KanbanBoard`, a client component that holds the entire board in local `useState` seeded from `initialData`. Nothing is persisted yet; Part 7 replaces this with backend API calls.
- `src/lib/kanban.ts` defines the data model and pure logic: `BoardData` is `{ columns: Column[], cards: Record<id, Card> }`, where each column holds ordered `cardIds`. `moveCard` handles same-column reordering and cross-column moves (dropping on a column id appends; dropping on a card id inserts at that position). Keep board mutations pure here so they stay unit-testable, and keep this shape in mind when designing the DB schema and the AI structured-output format.
- Components: `KanbanColumn` (droppable, renamable title), `KanbanCard` (sortable), `KanbanCardPreview` (drag overlay), `NewCardForm`.

## Target architecture (from AGENTS.md / PLAN.md)

A single Docker container where FastAPI (managed with `uv`) serves the statically exported Next.js build at `/` plus the API routes, backed by SQLite (created on first run). AI chat goes through OpenRouter with model `openai/gpt-oss-120b`, sending the board JSON plus conversation history and receiving structured output with a reply and an optional board update. Start/stop scripts for Mac, Linux, and Windows belong in `scripts/`.
