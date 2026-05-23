# TgGuild Quick Start Script

Write-Host "Starting TgGuild Development Environment..." -ForegroundColor Cyan

# Ensure a space-free target directory exists
if (-not (Test-Path "C:\HKRM2.0\target")) {
    New-Item -ItemType Directory -Path "C:\HKRM2.0\target" -Force | Out-Null
}

# Set Cargo target directory environment variable
$env:CARGO_TARGET_DIR = "C:\HKRM2.0\target"

# Check if we are in the right directory
if (Test-Path "app") {
    Set-Location "app"
} elseif (Test-Path "TgGuild\app") {
    Set-Location "TgGuild\app"
} else {
    Write-Error "Could not find 'app' directory. Please run this script from the project root."
    exit
}

# Run the tauri dev command
npm run tauri dev
