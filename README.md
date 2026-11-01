# Project Management

Project management with Kanban boards and an AI assistant. Next.js frontend, FastAPI backend, SQLite, packaged in Docker.

- Accounts (sign up, change password, delete account) and any number of boards per user
- Boards shared with other users; owners manage members
- Cards with details, priority, due date, labels, checklist and comments; drag and drop
- Columns that can be renamed, added, reordered and deleted
- Search, filters and a board summary; an activity log per board
- AI chat sidebar (OpenRouter) that can create, edit and move cards and add columns

## Run

Requires Docker (e.g. Colima: `brew install colima docker docker-compose && colima start`). Put settings in `.env` in the project root:

- `OPENROUTER_API_KEY` - for the AI chat
- `SESSION_SECRET` - optional; any long random string. Without it, sign-ins end when the container restarts.

```bash
scripts/start.sh    # Mac, Linux
scripts/stop.sh
```

```powershell
scripts\start.ps1   # Windows
scripts\stop.ps1
```

App: http://localhost:8000. Create an account on the sign-in page, or use the demo account `user` / `password`.
