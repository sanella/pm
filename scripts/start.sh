#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/.."
# Docker Desktop ships "docker compose"; Homebrew/Colima setups may only have "docker-compose".
compose="docker compose"; docker compose version >/dev/null 2>&1 || compose="docker-compose"
$compose up -d --build
until curl -sf http://localhost:8000/api/health >/dev/null; do sleep 1; done
echo "App running at http://localhost:8000"
