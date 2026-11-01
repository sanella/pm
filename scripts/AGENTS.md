# Scripts

Start and stop the app in Docker. Each script changes to the project root first, so they can be run from anywhere.

- `start.sh` / `stop.sh` - Mac and Linux
- `start.ps1` / `stop.ps1` - Windows (PowerShell)

Start runs `docker compose up -d --build` (rebuilds the image, runs in the background) and waits until `/api/health` answers before printing the URL (http://localhost:8000). Stop runs `docker compose down` (the `data` volume is kept). The `.sh` scripts fall back to the standalone `docker-compose` when the `docker compose` plugin is not available (e.g. Homebrew + Colima).
