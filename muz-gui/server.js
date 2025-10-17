require('dotenv').config({ path: '../shared/.env' });
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const multer = require('multer');
const { Client, GatewayIntentBits } = require('discord.js');

// ===== Ścieżki i shared dir =====
const SHARED_DIR = '../shared';
const BASE_MUSIC_DIR = path.join(SHARED_DIR, 'music');
const SERVERS_FILE = path.join(SHARED_DIR, 'serwery.txt');

// ===== ENV =====
const {
  CLIENT_ID,
  CLIENT_SECRET,
  CALLBACK_URL,
  SESSION_SECRET,
  BOT_TOKEN,
  OWNER_ID,
  PORT = 3000
} = process.env;

if (!CLIENT_ID || !CLIENT_SECRET || !CALLBACK_URL || !BOT_TOKEN) {
  console.warn('⚠️ Brakuje danych Discord w .env');
}

// ===== Passport =====
const SCOPES = ['identify', 'guilds'];
passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));
if (CLIENT_ID && CLIENT_SECRET && CALLBACK_URL) {
  passport.use(
    new DiscordStrategy(
      { clientID: CLIENT_ID, clientSecret: CLIENT_SECRET, callbackURL: CALLBACK_URL, scope: SCOPES },
      (accessToken, refreshToken, profile, done) => {
        profile.accessToken = accessToken;
        profile.refreshToken = refreshToken;
        return done(null, profile);
      }
    )
  );
}

// ===== Express app =====
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({ secret: SESSION_SECRET || 'change-this', resave: false, saveUninitialized: false }));
app.use(passport.initialize());
app.use(passport.session());

const ensureAuth = (req, res, next) => {
  if (req.isAuthenticated && req.isAuthenticated()) return next();
  console.log('🚫 Nieautoryzowany dostęp do API');
  res.status(401).json({ error: 'unauthenticated' });
};

// ===== Discord client =====
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });
client.login(BOT_TOKEN).then(() => console.log('✅ Bot Discord zalogowany')).catch(err => console.error('❌ Błąd logowania bota:', err));

// ===== Helpers =====
function resolveServerDir(serverId) {
  if (!BASE_MUSIC_DIR) return null;
  const entries = fs.readdirSync(BASE_MUSIC_DIR, { withFileTypes: true });
  for (const d of entries) if (d.isDirectory() && d.name.startsWith(serverId)) return path.join(BASE_MUSIC_DIR, d.name);
  return null;
}

function safePath(base, filePath) {
  const resolved = path.resolve(base, filePath);
  if (!resolved.startsWith(path.resolve(base))) throw new Error('Invalid path: ' + filePath);
  return resolved;
}

function sanitizeFilename(name) {
  return name.replace(/[^a-zA-Z0-9._ \-()\[\]]+/g, '_').slice(0, 255);
}

function log(msg) {
  const ts = new Date().toISOString().replace('T', ' ').split('.')[0];
  console.log(`[${ts}] ${msg}`);
}

// ===== Static =====
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/auth/discord', passport.authenticate('discord'));
app.get('/auth/callback', passport.authenticate('discord', { failureRedirect: '/' }), (req, res) => res.redirect('/'));
app.get('/auth/logout', (req, res) => { req.logout?.(); req.session.destroy(() => res.redirect('/')); });

// ===== API: Servers =====
app.get('/api/servers', ensureAuth, async (req, res) => {
  const user = req.user;
  if (!user || !user.guilds) {
    log('⚠️ Brak informacji o guilds dla użytkownika.');
    return res.json([]);
  }

  try {
    // ===== Wszystkie foldery muzyczne =====
    const entries = fs.readdirSync(BASE_MUSIC_DIR, { withFileTypes: true });
    const folders = entries
      .filter(d => d.isDirectory())
      .map(d => {
        const [id, ...rest] = d.name.split(' - ');
        return { id, name: rest.join(' - ') || d.name };
      });

    // ===== Jeśli właściciel — wszystko + com/default =====
    if (user.id === OWNER_ID) {
      log(`👑 OWNER ${user.username} pobiera listę ${ownerList.length} serwerów`);
      return res.json(ownerList);
    }

    // ===== Użytkownik: tylko serwery, na których jest adminem i bot jest obecny =====
    const adminGuilds = user.guilds.filter(g => {
      const hasAdmin = (g.permissions & 0x8) === 0x8; // ADMINISTRATOR flag
      const botInGuild = client.guilds.cache.has(g.id);
      return hasAdmin && botInGuild;
    });

    log(`👤 ${user.username} (${user.id}) ma dostęp do ${adminGuilds.length} serwerów`);

    const visible = folders.filter(f => adminGuilds.some(g => g.id === f.id));
    log(`📁 Serwery z folderami: ${visible.map(v => v.name).join(', ') || 'brak'}`);

    return res.json(visible);
  } catch (e) {
    log('❌ Błąd czytania folderu music: ' + e.message);
    res.json([]);
  }
});


// ===== File list =====
app.get('/api/files/:serverId', ensureAuth, (req, res) => {
  const dir = resolveServerDir(req.params.serverId);
  if (!dir) {
    log(`❌ Brak folderu serwera: ${req.params.serverId}`);
    return res.status(404).json({ error: 'server-directory-not-found' });
  }
  try {
    const items = fs.readdirSync(dir, { withFileTypes: true }).map(d => ({ name: d.name, isDirectory: d.isDirectory() }));
    res.json({ dir, items });
  } catch (e) {
    log('❌ Błąd odczytu plików: ' + e.message);
    res.status(500).json({ error: 'read-failed', details: e.message });
  }
});

// ===== File download =====
app.get('/api/files/:serverId/download', ensureAuth, (req, res) => {
  const dir = resolveServerDir(req.params.serverId);
  if (!dir) { log(`❌ Folder nie istnieje dla download: ${req.params.serverId}`); return res.status(404).end(); }
  const file = req.query.file;
  if (!file) { log(`❌ Brak pliku do pobrania dla ${req.params.serverId}`); return res.status(400).json({ error: 'file-required' }); }
  try {
    const safe = safePath(dir, file);
    log(`⬇️ Pobieranie pliku ${safe}`);
    res.download(safe);
  } catch (e) {
    log('❌ Błąd download: ' + e.message);
    res.status(400).json({ error: 'invalid-path' });
  }
});

// ===== File upload =====
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const storage = multer.memoryStorage();
const upload = multer({ storage, limits: { fileSize: MAX_UPLOAD_BYTES } });

app.post('/api/files/:serverId/upload', ensureAuth, upload.single('file'), (req, res) => {
  const dir = resolveServerDir(req.params.serverId);
  if (!dir) { log(`❌ Brak folderu do upload: ${req.params.serverId}`); return res.status(404).json({ error: 'server-directory-not-found' }); }
  if (!req.file) { log(`❌ Brak przesłanego pliku dla ${req.params.serverId}`); return res.status(400).json({ error: 'no-file' }); }

  fs.mkdirSync(dir, { recursive: true });
  const ext = path.extname(req.file.originalname).toLowerCase();
  const ALLOWED_EXT = ['.mp3', '.flac', '.wav', '.m4a', '.ogg'];
  if (!ALLOWED_EXT.includes(ext)) { log(`❌ Zabronione rozszerzenie: ${ext}`); return res.status(400).json({ error: 'invalid-extension' }); }

  const safeName = sanitizeFilename(req.file.originalname);
  const target = path.join(dir, safeName);
  fs.writeFileSync(target, req.file.buffer);
  log(`⬆️ Upload pliku ${safeName} do ${dir}`);
  res.json({ ok: true, file: req.file.originalname });
});

// ===== File delete =====
app.delete('/api/files/:serverId', ensureAuth, (req, res) => {
  const dir = resolveServerDir(req.params.serverId);
  if (!dir) { log(`❌ Brak folderu do delete: ${req.params.serverId}`); return res.status(404).json({ error: 'server-directory-not-found' }); }
  const { file } = req.body;
  if (!file) { log(`❌ Brak pliku do usunięcia dla ${req.params.serverId}`); return res.status(400).json({ error: 'file-required' }); }
  try {
    const p = safePath(dir, file);
    fs.unlinkSync(p);
    log(`🗑️ Usunięto plik ${file} w ${dir}`);
    res.json({ ok: true });
  } catch (e) {
    log('❌ Błąd delete pliku: ' + e.message);
    res.status(500).json({ error: 'delete-failed', details: e.message });
  }
});

// ===== Health =====
app.get('/health', (req, res) => res.json({ ok: true }));

// ===== Start server =====
app.listen(PORT, '0.0.0.0', () => log(`🌍 Server listening on port ${PORT}`));
