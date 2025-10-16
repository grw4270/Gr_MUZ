# install.ps1 - Skrypt instalacyjny dla Gr_MUZ (Windows)
$ErrorActionPreference = "Stop"

Write-Host "--- Uruchamianie instalatora Gr_MUZ dla Windows ---" -ForegroundColor Yellow

# Funkcja do sprawdzania i instalowania za pomocą Winget
function Install-WingetPackage {
    param(
        [Parameter(Mandatory=$true)][string]$Name,
        [Parameter(Mandatory=$true)][string]$Id
    )
    if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
        Write-Host "❌ Winget nie znaleziony. Upewnij się, że używasz nowoczesnego systemu Windows 10/11." -ForegroundColor Red
        return $false
    }
    
    Write-Host "🛠️ Sprawdzanie i instalowanie $Name..." -ForegroundColor Green
    try {
        winget install --id $Id --exact --silent --accept-package-agreements --accept-source-agreements
        Write-Host "✅ $Name zainstalowano pomyślnie." -ForegroundColor Green
        return $true
    } catch {
        Write-Host "⚠️ Nie udało się zainstalować $Name ($Id). Spróbuj zainstalować ręcznie." -ForegroundColor Yellow
        return $false
    }
}

# --- 1. INSTALACJA NARZĘDZI SYSTEMOWYCH (GIT, NODE.JS, FFMPEG) ---

# 1.1 Git
Install-WingetPackage -Name "Git" -Id "Git.Git"

# 1.2 Node.js (zależność główna)
Install-WingetPackage -Name "Node.js (LTS)" -Id "OpenJS.Nodejs.LTS"

# 1.3 FFmpeg (kluczowy dla audio)
Install-WingetPackage -Name "FFmpeg" -Id "Gyan.FFmpeg"

# Poczekaj chwilę, aby PATH się zaktualizował (zwłaszcza po instalacji Node.js)
Start-Sleep -Seconds 3

# --- 2. INSTALACJA ZALEŻNOŚCI PROJEKTU ---
Write-Host "📦 Instalowanie zależności Node.js (npm install)..." -ForegroundColor Green
try {
    npm install
    npm install --prefix .\muz-gui
    Write-Host "✅ Zależności Node.js zainstalowane pomyślnie." -ForegroundColor Green
} catch {
    Write-Host "❌ Błąd podczas instalacji zależności npm. Upewnij się, że Node.js działa." -ForegroundColor Red
    exit 1
}

# --- 3. KONFIGURACJA ŚRODOWISKA ---
Write-Host "🛠️ Konfigurowanie pliku .env..." -ForegroundColor Green
$envFile = ".\shared\.env"
if (-not (Test-Path $envFile)) {
    New-Item -Path ".\shared\music\default" -ItemType Directory -Force | Out-Null
    New-Item -Path ".\shared\music\com" -ItemType Directory -Force | Out-Null
    
    @"
# UZUPEŁNIJ TE DANE PRZED URUCHOMIENIEM BOTA
BOT_TOKEN=Wprowadź_Tutaj_Swój_Token
OWNER_ID=Wprowadź_Tutaj_Swój_ID_Użytkownika
"@ | Set-Content $envFile
    Write-Host "Utworzono plik konfiguracyjny shared\.env. Musisz go edytować!" -ForegroundColor Yellow
}

Write-Host "--- ✅ INSTALACJA DLA WINDOWS ZAKOŃCZONA POMYŚLNIE ---" -ForegroundColor Yellow
Write-Host "Aby uruchomić bota (w Terminalu/CMD): npm run start:bot" -ForegroundColor Cyan
