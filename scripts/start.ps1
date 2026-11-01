$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")
docker compose up -d --build
while ($true) {
    try { Invoke-WebRequest -UseBasicParsing http://localhost:8000/api/health | Out-Null; break }
    catch { Start-Sleep -Seconds 1 }
}
Write-Host "App running at http://localhost:8000"
