#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/.."
compose="docker compose"; docker compose version >/dev/null 2>&1 || compose="docker-compose"
$compose down
