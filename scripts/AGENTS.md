# Scripts

Start and stop the app in Docker. Each script changes to the project root first, so they can be run from anywhere.

- `start.sh` / `stop.sh` - Mac and Linux
- `start.ps1` / `stop.ps1` - Windows (PowerShell)

Start runs `docker compose up -d --build` (rebuilds the image, runs in the background, app at http://localhost:8000). Stop runs `docker compose down` (the `data` volume is kept).
