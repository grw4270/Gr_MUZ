#!/bin/bash
# install.sh - Skrypt instalacyjny dla Gr_MUZ (Linux)

echo "--- Uruchamianie instalatora Gr_MUZ dla Linuksa ---"

# --- 1. SPRAWDZENIE I INSTALACJA NARZĘDZI SYSTEMOWYCH (FFMPEG, GIT) ---

# Instalacja Git
if ! command -v git &> /dev/null; then
    echo "🛠️ Instalowanie Git..."
    sudo apt update && sudo apt install git -y
else
    echo "✅ Git jest już zainstalowany."
fi

# Instalacja FFmpeg (kluczowy dla przetwarzania audio)
if ! command -v ffmpeg &> /dev/null; then
    echo "🛠️ Instalowanie FFmpeg (konieczne do odtwarzania audio)..."
    sudo apt install ffmpeg -y
else
    echo "✅ FFmpeg jest już zainstalowany."
fi

# --- 2. INSTALACJA LUB WERYFIKACJA NODE.JS ---
# Najlepszym sposobem na instalację Node.js jest użycie NodeSource.

if ! command -v node &> /dev/null || [ "$(node -v | cut -d'v' -f2 | cut -d'.' -f1)" -lt 18 ]; then
    echo "🛠️ Instalowanie Node.js (v18+)..."
    # Instalacja z NodeSource (zalecana metoda dla najnowszej wersji LTS)
    curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
    sudo apt install nodejs -y
else
    echo "✅ Node.js (v$(node -v)) jest zainstalowany i spełnia wymagania."
fi

# --- 3. INSTALACJA ZALEŻNOŚCI PROJEKTU ---
echo "📦 Instalowanie zależności Node.js (npm install)..."
npm install
npm install --prefix ./muz-gui # Instalacja zależności dla GUI

# --- 4. KONFIGURACJA ŚRODOWISKA ---
echo "🛠️ Konfigurowanie pliku .env..."
mkdir -p shared/music/default
mkdir -p shared/music/com

ENV_FILE="./shared/.env"
if [ ! -f "$ENV_FILE" ]; then
    echo "# UZUPEŁNIJ TE DANE PRZED URUCHOMIENIEM BOTA" > "$ENV_FILE"
    echo "BOT_TOKEN=Wprowadź_Tutaj_Swój_Token" >> "$ENV_FILE"
    echo "OWNER_ID=Wprowadź_Tutaj_Swój_ID_Użytkownika" >> "$ENV_FILE"
    echo "Utworzono plik konfiguracyjny shared/.env. Musisz go edytować!"
fi

echo "--- ✅ INSTALACJA DLA LINUKSA ZAKOŃCZONA POMYŚLNIE ---"
echo "Aby uruchomić bota: npm run start:bot"
