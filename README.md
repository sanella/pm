# Project Management MVP

Kanban board with an AI chat sidebar. Next.js frontend, FastAPI backend, SQLite, packaged in Docker.

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

App: http://localhost:8000
