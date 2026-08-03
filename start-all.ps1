# One-click launcher for the banking app.
# Opens 7 PowerShell windows, one per service.

$root = $PSScriptRoot

Write-Host "Starting Docker (Postgres + Redpanda)..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit","-Command","cd '$root\docker'; docker compose up"

Start-Sleep -Seconds 8

Write-Host "Starting backend..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit","-Command","cd '$root\backend'; npm run dev"

Start-Sleep -Seconds 3

Write-Host "Starting workers..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit","-Command","cd '$root\workers\notifier'; npm run dev"
Start-Process powershell -ArgumentList "-NoExit","-Command","cd '$root\workers\audit-logger'; npm run dev"
Start-Process powershell -ArgumentList "-NoExit","-Command","cd '$root\workers\fraud-detector'; npm run dev"
Start-Process powershell -ArgumentList "-NoExit","-Command","cd '$root\workers\statement-worker'; npm run dev"

Start-Sleep -Seconds 3

Write-Host "Starting frontend..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit","-Command","cd '$root\frontend'; npm run dev"

Write-Host ""
Write-Host "All services starting. Opening browser in 15 seconds..." -ForegroundColor Green
Start-Sleep -Seconds 15
Start-Process "http://localhost:5173"