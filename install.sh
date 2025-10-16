#!/bin/bash
# install.sh - Skrypt instalacyjny dla Gr_MUZ (Linux)

echo "--- Uruchamianie instalatora Gr_MUZ dla Linuksa ---"

# Używamy apt, bo to sugeruje struktura poleceń Twojego skryptu.

# --- 1. ZAINSTALUJ PODSTAWOWE NARZĘDZIA (curl, sudo, jeśli brak) ---
# Jeśli skrypt jest uruchamiany jako root, pomijamy sudo przy tych pierwszych instalacjach
if ! command -v curl &> /dev/null; then
    echo "🛠️ Instalowanie curl (do pobierania Node.js)..."
    # Używamy 'apt install' bez 'sudo', jeśli jesteśmy rootem
    apt install curl -y
fi

# Ponownie instalujemy Git, Node.js i FFmpeg, tym razem bez sudo
echo "🛠️ Instalowanie Git, FFmpeg i Node.js (jeśli brak)..."
apt update
apt install git ffmpeg -y

# --- 2. INSTALACJA NODE.JS (Używamy NodeSource dla najnowszej wersji LTS) ---

if ! command -v node &> /dev/null || [ "$(node -v | cut -d'v' -f2 | cut -d'.' -f1)" -lt 18 ]; then
    echo "🛠️ Instalowanie Node.js (v18+) i npm..."
    # Pobranie i uruchomienie instalatora Node.js (tu znowu może być potrzebne sudo jeśli jesteś zwykłym userem)
    curl -fsSL https://deb.nodesource.com/setup_lts.x | bash -
    apt install nodejs -y
else
    echo "✅ Node.js (v$(node -v)) jest zainstalowany i spełnia wymagania."
fi

# Weryfikacja, czy npm jest dostępne
if ! command -v npm &> /dev/null; then
    echo "❌ NPM nie jest dostępne po instalacji Node.js. Proszę zweryfikować instalację Node.js."
    exit 1
fi

# --- 3. INSTALACJA ZALEŻNOŚCI PROJEKTU ---
echo "📦 Instalowanie zależności Node.js (npm install)..."
npm install
npm install --prefix ./muz-gui # Instalacja zależności dla GUI

# --- 4. KONFIGURACJA ŚRODOWISKA (Pozostaje bez zmian) ---
echo "🛠️ Konfigurowanie pliku .env..."
# ... (reszta kodu odpowiedzialna za .env i foldery) ...

echo "--- ✅ INSTALACJA DLA LINUKSA ZAKOŃCZONA POMYŚLNIE ---"
echo "Aby uruchomić bota: npm run start:bot"
