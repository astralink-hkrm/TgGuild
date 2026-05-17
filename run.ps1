# TgGuild Quick Start Script

Write-Host "Starting TgGuild Development Environment..." -ForegroundColor Cyan

# Check if we are in the right directory
if (Test-Path "app") {
    Set-Location "app"
} else {
    Write-Error "Could not find 'app' directory. Please run this script from the project root."
    exit
}

# Run the tauri dev command
npm run tauri dev
