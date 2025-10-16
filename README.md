````markdown
# 🎧 Gr_MUZ: Audio Bot dla Discorda z Wbudowanym Panelem Zarządzania

> Zarządzaj automatycznym odtwarzaniem plików audio, komendami na serwerach Discord i strukturą plików za pomocą intuicyjnego interfejsu GUI.

[![Discord.js Version](https://img.shields.io/badge/Discord.js-v14-blue.svg)](https://discord.js.org/)
[![Node.js Version](https://img.shields.io/badge/Node.js-LTS%20v18%2B-green.svg)](https://nodejs.org/)
[![License](https://img.shields.io/badge/License-Unspecified-lightgray.svg)](https://github.com/grw4270/Gr_MUZ/blob/CORE/LICENSE)

***

## 1. Wymagania Wstępne

Przed rozpoczęciem instalacji upewnij się, że masz przygotowane następujące elementy:

| Narzędzie | Wymagana Wersja | Cel |
| :--- | :--- | :--- |
| **Node.js** | LTS (v18+) | Środowisko uruchomieniowe dla bota i GUI. |
| **Git** | Najnowsza | Klonowanie repozytorium. |
| **FFmpeg** | Najnowsza | **Kluczowy** dla przetwarzania i odtwarzania plików audio. |
| **Token Bota** | Własny | Uwierzytelnienie bota na Discordzie. |
| **ID Użytkownika** | Twój ID | Ustawienie wyłącznego dostępu do komend Slash. |

***

## 2. Instalacja Automatyczna

Do automatycznej instalacji zależności systemowych (Git, Node.js, FFmpeg) oraz zależności Node.js (`npm install`) służą dedykowane skrypty.

### 🛠️ Krok 1: Klonowanie Repozytorium

Otwórz terminal (lub PowerShell) i sklonuj projekt:

```bash
git clone [https://github.com/grw4270/Gr_MUZ.git](https://github.com/grw4270/Gr_MUZ.git)
cd Gr_MUZ
````

### ⚙️ Krok 2: Uruchomienie Instalatora

| System | Komenda Instalacyjna | Uwagi |
| :--- | :--- | :--- |
| **Linux (Bash)** | `./install.sh` | Upewnij się, że plik ma uprawnienia: `chmod +x install.sh`. |
| **Windows 10/11** | `.\install.ps1` | Uruchom **PowerShell jako Administrator** i wykonaj skrypt. |

-----

## 3\. Konfiguracja Bota (`shared/.env`)

Skrypt instalacyjny tworzy plik **`shared/.env`**. Jest to plik konfiguracyjny, który **musisz edytować**, uzupełniając dane autoryzacyjne.

```dotenv
# Plik konfiguracyjny - znajduje się w katalogu shared/
# --- 1. Dane Discord API
BOT_TOKEN=Wprowadź_Tutaj_Swój_Token_Bota
OWNER_ID=Wprowadź_Tutaj_Swój_ID_Użytkownika
```

-----

## 4\. Struktura i Zarządzanie Plikami Audio

Bot odtwarza lokalne pliki audio (MP3, WAV, FLAC, OGG, M4A). Wszystkie pliki należy umieścić w katalogu **`shared/music/`**.

### 🎧 Pliki Automatyczne (Auto-Play/Join)

Bot losowo wybiera plik do odtworzenia, gdy użytkownik dołącza do kanału głosowego.

| Ścieżka | Priorytet | Funkcja |
| :--- | :--- | :--- |
| `shared/music/<ServerID> - <ServerName>/` | **Najwyższy** | Indywidualny folder serwera (tworzony automatycznie). |
| `shared/music/default/` | Najniższy | Domyślne pliki odtwarzane dla **wszystkich serwerów**. |

### 🎙️ Pliki Komend (Slash Command)

| Ścieżka | Użycie |
| :--- | :--- |
| `shared/music/com/` | Pliki z tego folderu są dostępne do wyboru w komendzie `/play`. |

-----

## 5\. Uruchamianie Bota i GUI

Projekt składa się z dwóch niezależnych procesów. Aby w pełni korzystać z funkcji, uruchom je oba:

| Usługa | Komenda Uruchomienia | Opis |
| :--- | :--- | :--- |
| **Główny Bot** | `npm run start:bot` | Obsługuje logikę Discord, audio i automatyczne odtwarzanie. |
| **Panel GUI** | `npm run start:gui` | Uruchamia lokalny interfejs graficzny do zarządzania plikami i serwerami. |

-----

## 6\. Użycie Komend (Właściciel)

Komendy Slash są aktywne **wyłącznie** dla Użytkownika-Właściciela zdefiniowanego w pliku `.env`.

| Komenda | Funkcjonalność |
| :--- | :--- |
| **`/play [plik] [server_id]`** | Odtwarza plik z folderu `com` na wybranym serwerze. |
| **`/status`** | Wyświetla listę aktywnych połączeń i aktualnie odtwarzane pliki. |
| **`/unmute`** | Wymusza odmutowanie bota na wszystkich kanałach. |
| **`/ping`** | Szybki test sprawności bota. |

```
```
