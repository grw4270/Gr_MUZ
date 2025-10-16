require('dotenv').config({ path: '../shared/.env' });
const fs = require('fs/promises'); 
const fsSync = require('fs'); // Pozostawiamy dla szybkiej, wczesnej kontroli istnienia folderów
const path = require('path');

const { 
    Client, 
    GatewayIntentBits, 
    REST, 
    Routes, 
    SlashCommandBuilder 
} = require('discord.js');

const { 
    joinVoiceChannel, 
    createAudioPlayer, 
    createAudioResource, 
    AudioPlayerStatus, 
    NoSubscriberBehavior, 
    getVoiceConnection 
} = require('@discordjs/voice');

// Wymuszenie IPv4 i WebSocket dla stabilności połączeń głosowych
process.env.DISCORDJS_VOICE_FORCE_WS = "true";
process.env.FORCE_IPV4 = "true";

// --- KONFIGURACJA ŚCIEŻEK I ZMIENNYCH ŚRODOWISKOWYCH ---
const TOKEN = process.env.BOT_TOKEN;
const ALLOWED_USER_ID = process.env.OWNER_ID;

const MUSIC_DIR = path.join('../shared/music');
const DEFAULT_DIR = path.join(MUSIC_DIR, 'default');
const SERVERS_FILE = path.join('../shared', 'servers.txt');
const COM_DIR = path.join(MUSIC_DIR, 'com');
const SUPPORTED_EXTENSIONS = ['mp3', 'wav', 'm4a', 'ogg', 'flac'];

if (!TOKEN || !ALLOWED_USER_ID) {
    console.error('❌ Brakuje DISCORD_TOKEN lub OWNER_ID w .env');
    process.exit(1);
}

// --- GLOBALNE STRUKTURY DANYCH ---
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMessages, 
        GatewayIntentBits.MessageContent, 
        GatewayIntentBits.GuildVoiceStates
    ]
});

// Mapowanie { guildId: { connection, player, currentlyPlayingFile, channelId } }
const connectionMap = new Map();
// Flaga zapobiegająca auto-odtwarzaniu przed pełną inicjalizacją
const initializing = { done: false }; 

// --- HELPERY SYNC & ASYNC ---

/** Zapewnia istnienie katalogu (synchronicznie dla wczesnych wywołań) */
function ensureDir(dir) { 
    if (!fsSync.existsSync(dir)) fsSync.mkdirSync(dir, { recursive: true }); 
}

/** Logowanie z timestampem */
function log(msg) {
    const ts = new Date().toISOString().replace('T',' ').split('.')[0];
    console.log(`[${ts}] ${msg}`);
}

/** * Wybiera losowy plik audio z katalogu (synchronicznie). 
 * POPRAWKA: Używa f.split('.').pop() zamiast f.split('.pop')()
 */
function pickRandomAudioFromDir(dir) {
    try {
        if (!fsSync.existsSync(dir)) return null;
        const files = fsSync.readdirSync(dir).filter(f => {
            // POPRAWIONE: f.split('.').pop()
            const ext = f.split('.').pop()?.toLowerCase(); 
            return ext && SUPPORTED_EXTENSIONS.includes(ext);
        });
        if (!files.length) return null;
        return path.join(dir, files[Math.floor(Math.random() * files.length)]);
    } catch (e) {
        // Ten błąd powinien zniknąć po poprawce
        console.error(`Błąd przy odczycie losowego pliku z ${dir}:`, e.message); 
        return null;
    }
}

/** ASYNCHRONICZNE POBIERANIE LISTY SERWERÓW */
async function getServersList() {
    if (!fsSync.existsSync(SERVERS_FILE)) return [];
    try {
        const content = await fs.readFile(SERVERS_FILE, 'utf8');
        return content.split('\n').filter(Boolean);
    } catch (e) {
        console.error('Błąd odczytu servers.txt:', e);
        return [];
    }
}

// --- AKTUALIZACJA KOMEND (SLASH COMMANDS) ---
async function updateSlashCommands() {
    try {
        const rest = new REST({ version: '10' }).setToken(TOKEN);
        
        const servers = await getServersList();

        let files = [];
        if (fsSync.existsSync(COM_DIR)) {
            files = (await fs.readdir(COM_DIR)).filter(f => {
                const ext = f.split('.').pop()?.toLowerCase();
                return ext && SUPPORTED_EXTENSIONS.includes(ext);
            });
        }

        const commands = [
            new SlashCommandBuilder().setName('ping').setDescription('Sprawdza działanie bota'),
            new SlashCommandBuilder().setName('status').setDescription('Pokazuje status odtwarzania'),
            new SlashCommandBuilder().setName('unmute').setDescription('Odmutowuje bota na wszystkich kanałach, gdzie jest połączony'),
            new SlashCommandBuilder()
                .setName('play')
                .setDescription('Odtwarza wybrany plik z /com na kanale z najwięcej użytkownikami')
                .addStringOption(o => {
                    o.setName('server_id')
                        .setDescription('Wybierz serwer z listy, na którym ma nastąpić odtwarzanie')
                        .setRequired(false);
                    for (const line of servers.slice(0, 25)) {
                        const id = line.split(' - ')[0];
                        const name = line.substring(line.indexOf(' - ') + 3) || id;
                        o.addChoices({ name, value: id });
                    }
                    return o;
                })
                .addStringOption(o => {
                    o.setName('plik')
                        .setDescription('Plik do odtworzenia z folderu /com')
                        .setRequired(false);
                    for (const f of files.slice(0, 25)) o.addChoices({ name: f, value: f });
                    return o;
                }),
        ].map(c => c.toJSON());

        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        log(`✅ Zaktualizowano komendy globalne.`);
    } catch (err) {
        console.error('❌ Błąd podczas aktualizacji komend:', err);
    }
}

// --- SYNC SERWERÓW (ASYNCHRONICZNIE) ---
async function syncServers() {
    ensureDir(MUSIC_DIR); 
    ensureDir(DEFAULT_DIR);
    ensureDir(COM_DIR);
    if (!fsSync.existsSync(SERVERS_FILE)) await fs.writeFile(SERVERS_FILE, '', 'utf8');

    const currentGuilds = new Map(client.guilds.cache.map(g => [g.id, g.name]));
    let servers = await getServersList();
    const knownIds = new Set(servers.map(line => line.split(' - ')[0]?.trim()));

    let changed = false;

    // --- Dodaj brakujące serwery ---
    for (const [id, name] of currentGuilds.entries()) {
        if (!knownIds.has(id)) {
            const folderName = `${id} - ${name}`;
            const serverDir = path.join(MUSIC_DIR, folderName);
            await fs.mkdir(serverDir, { recursive: true });
            servers.push(`${id} - ${name}`);
            log(`📁 Dodano brakujący serwer: ${name}`);
            changed = true;
        }
    }

    // --- Usuń nieaktualne wpisy ---
    const validIds = new Set(currentGuilds.keys());
    const updatedServers = servers.filter(line => validIds.has(line.split(' - ')[0]?.trim()));
    if (updatedServers.length < servers.length) {
        servers = updatedServers;
        log(`🧹 Usunięto ${servers.length - updatedServers.length} nieaktualnych wpisów z servers.txt`);
        changed = true;
    }
    
    if (changed) {
        await fs.writeFile(SERVERS_FILE, servers.join('\n'), 'utf8');
    }

    // --- Usuń foldery dla nieistniejących serwerów ---
    try {
        const entries = await fs.readdir(MUSIC_DIR, { withFileTypes: true });
        for (const d of entries) {
            if (!d.isDirectory()) continue;
            const [id] = d.name.split(' - ');
            if (!validIds.has(id) && !['com', 'default'].includes(d.name.toLowerCase())) {
                await fs.rm(path.join(MUSIC_DIR, d.name), { recursive: true, force: true });
                log(`🗑️ Usunięto folder starego serwera: ${d.name}`);
            }
        }
    } catch (e) {
        console.error('Błąd podczas czyszczenia folderów muzycznych:', e);
    }

    await updateSlashCommands();
}

// --- ODTWARZANIE AUDIO ---
function playAndLeave(channel, file) {
    const guildId = channel.guild.id;
    
    const existingConnection = getVoiceConnection(guildId);
    if (existingConnection) {
        try { existingConnection.destroy(); } catch {}
        connectionMap.delete(guildId);
    }
    
    const connection = joinVoiceChannel({
        channelId: channel.id,
        guildId: channel.guild.id,
        adapterCreator: channel.guild.voiceAdapterCreator,
        selfDeaf: false,
        selfMute: false
    });
    
    const player = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Pause } });
    const resource = createAudioResource(file);
    connection.subscribe(player);
    connectionMap.set(guildId, { 
        connection, 
        player, 
        currentlyPlayingFile: path.basename(file), 
        channelId: channel.id 
    });

    log(`🎵 Odtwarzanie: ${path.basename(file)} na ${channel.guild.name} (Kanał: ${channel.name})`);
    player.play(resource);

    player.once(AudioPlayerStatus.Idle, () => {
        log(`🛑 Odtwarzanie zakończone (${channel.guild.name}) — rozłączanie`);
        try { connection.destroy(); } catch {}
        connectionMap.delete(guildId);
    });

    player.on('error', err => { 
        log(`⚠️ AudioPlayer błąd (${channel.guild.name}): ${err.message}`); 
        try { connection.destroy(); } catch {} 
        connectionMap.delete(guildId); 
    });
}

// --- ZDARZENIA DISCORD ---

client.once('ready', async () => {
    log(`✅ Zalogowano jako ${client.user.tag}`);
    
    ensureDir(MUSIC_DIR); 
    ensureDir(DEFAULT_DIR);
    ensureDir(COM_DIR);
    
    await syncServers(); 
    initializing.done = true;
});

client.on('guildDelete', async guild => {
    log(`🤖 Opuściłem serwer: ${guild.name}`);
    const existingConnection = getVoiceConnection(guild.id);
    if (existingConnection) {
        try { existingConnection.destroy(); } catch {}
        connectionMap.delete(guild.id);
    }

    const folderName = `${guild.id} - ${guild.name}`;
    const serverDir = path.join(MUSIC_DIR, folderName);

    try {
        await fs.rm(serverDir, { recursive: true, force: true });
        log(`🗑️ Usunięto folder serwera: ${guild.name}`);
    } catch (err) { 
        if (err.code !== 'ENOENT') console.error('Błąd usuwania folderu:', err); 
    }

    try {
        let servers = await getServersList();
        const before = servers.length;
        servers = servers.filter(line => !line.startsWith(guild.id));
        if (servers.length < before) {
            await fs.writeFile(SERVERS_FILE, servers.join('\n'), 'utf8');
            log(`🗑️ Usunięto wpis serwera: ${guild.name}`);
        }
    } catch (err) { console.error('Błąd aktualizacji servers.txt:', err); }

    updateSlashCommands();
});

client.on('guildCreate', async guild => {
    log(`🎉 Dołączyłem do nowego serwera: ${guild.name}`);
    const folderName = `${guild.id} - ${guild.name}`;
    const serverDir = path.join(MUSIC_DIR, folderName);
    
    try {
        await fs.mkdir(serverDir, { recursive: true });
        
        let servers = await getServersList();
        if (!servers.some(line => line.startsWith(guild.id))) {
            await fs.appendFile(SERVERS_FILE, `${guild.id} - ${guild.name}\n`);
            log(`📁 Utworzono folder i wpisano nowy serwer: ${guild.name}`);
        }
    } catch (err) {
        console.error('Błąd tworzenia folderu/wpisu dla nowego serwera:', err);
    }
    
    updateSlashCommands();
});

// --- VOICE STATE UPDATE (Automatyczne odtwarzanie) ---
client.on('voiceStateUpdate', (oldState, newState) => {
    if (!initializing.done) return;
    
    if (!oldState.channelId && newState.channelId) {
        const channel = newState.channel;
        if (!channel || channel.guild.id !== newState.guild.id) return;
        
        const nonBotMembers = channel.members.filter(m => !m.user.bot);
        if (nonBotMembers.size === 1) {
            const isJoiningUser = nonBotMembers.firstKey() === newState.member.id;
            
            if (isJoiningUser && !getVoiceConnection(channel.guild.id)) {
                const serverFolderPath = path.join(MUSIC_DIR, `${channel.guild.id} - ${channel.guild.name}`);
                
                const file = pickRandomAudioFromDir(serverFolderPath) || pickRandomAudioFromDir(DEFAULT_DIR);
                
                if (file) {
                    playAndLeave(channel, file);
                } else {
                    log(`⚠️ Nie znaleziono plików do automatycznego odtwarzania dla serwera ${channel.guild.name}`);
                }
            }
        }
    }
});

// --- OBSŁUGA KOMEND SLASH ---
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return; 

    const cmd = interaction.commandName;
    
    // 1. Sprawdzenie uprawnień
    if (interaction.user.id !== ALLOWED_USER_ID) {
        try {
            await interaction.reply({ content: '⛔ Nie masz uprawnień.', ephemeral: true });
        } catch (e) {
            if (e.code === 10062) return; 
            console.error('Błąd przy szybkiej odpowiedzi dla nieuprawnionego użytkownika:', e);
        }
        return;
    }
    
    // 2. Natychmiastowe odroczenie (deferReply)
    try {
        await interaction.deferReply({ ephemeral: true }); 
    } catch (e) {
        if (e.code === 10062) {
            console.log(`[TIMEOUT] Interakcja dla /${cmd} jest zbyt stara. Zignorowano błąd 10062.`);
            return; 
        }
        console.error('Błąd przy deferReply:', e);
        return;
    }

    try {
        if (cmd === 'ping') {
            await interaction.editReply('🏓 Pong! Bot działa.');
        }
        else if (cmd === 'status') {
            let text = '--- STATUS AKTYWNYCH POŁĄCZEŃ ---\n';
            if (!connectionMap.size) {
                text += 'Brak aktywnych połączeń głosowych.';
            } else {
                for (const [guildId, obj] of connectionMap.entries()) {
                    const guildName = client.guilds.cache.get(guildId)?.name || guildId;
                    const channelName = client.channels.cache.get(obj.channelId)?.name || obj.channelId;
                    text += `\n**Serwer:** ${guildName}\n`;
                    text += `**Kanał:** ${channelName}\n`;
                    text += `**Plik:** ${obj.currentlyPlayingFile}\n`;
                }
            }
            await interaction.editReply({ content: text }); 
        }
        else if (cmd === 'unmute') {
            let unmutedCount = 0;
            for (const [guildId] of connectionMap.entries()) {
                const guild = client.guilds.cache.get(guildId);
                if (!guild) continue;
                
                try {
                    const me = guild.members.me ?? await guild.members.fetch(client.user.id);
                    
                    if (me.voice?.channel && me.voice.mute) {
                        await me.voice.setMute(false);
                        unmutedCount++;
                    }
                } catch (e) {
                    console.error(`Błąd odmutowania na serwerze ${guild.name}:`, e.message);
                }
            }
            await interaction.editReply(`🔊 Bot odmutowany na ${unmutedCount} serwerach.`);
        }
        else if (cmd === 'play') {
            const serverId = interaction.options.getString('server_id');
            const fileName = interaction.options.getString('plik');

            // --- Logika wyboru serwera ---
            let chosenGuild = null;
            if (serverId) {
                chosenGuild = client.guilds.cache.get(serverId);
            } else {
                const serversList = await getServersList();
                if (serversList.length) {
                    const firstServerId = serversList[0].split(' - ')[0];
                    chosenGuild = client.guilds.cache.get(firstServerId);
                }
            }

            if (!chosenGuild) {
                await interaction.editReply('❌ Brak dostępnego serwera do odtworzenia. Sprawdź servers.txt.');
                return;
            }

            // --- Logika wyboru pliku ---
            let chosenFile = fileName;
            if (!chosenFile) {
                const comFiles = fsSync.existsSync(COM_DIR) ? 
                    (await fs.readdir(COM_DIR)).filter(f => {
                        const ext = f.split('.').pop()?.toLowerCase();
                        return ext && SUPPORTED_EXTENSIONS.includes(ext);
                    }) : [];
                
                if (comFiles.length > 0) {
                    chosenFile = comFiles[0];
                }
            }

            if (!chosenFile) {
                await interaction.editReply('❌ Brak plików do odtworzenia w folderze /com lub nie wybrano pliku.');
                return;
            }
            const filePath = path.join(COM_DIR, chosenFile);
            
            if (!(await fs.stat(filePath).catch(() => null))) {
                await interaction.editReply(`❌ Plik **${chosenFile}** nie istnieje w folderze /com.`);
                return;
            }


            // --- Wybór kanału ---
            const voiceChannels = chosenGuild.channels.cache.filter(c => c.type === 2);
            
            let targetChannel = null, maxMembers = -1; 
            
            for (const ch of voiceChannels.values()) {
                const count = ch.members.filter(m => !m.user.bot).size; 
                if (count > maxMembers) { 
                    maxMembers = count; 
                    targetChannel = ch; 
                }
            }
            
            if (maxMembers <= 0 || !targetChannel) { 
                await interaction.editReply(`❌ Brak aktywnych kanałów głosowych z użytkownikami na serwerze **${chosenGuild.name}**.`);
                return;
            }

            // --- Odtwarzanie ---
            playAndLeave(targetChannel, filePath);
            
            await interaction.editReply(`🎵 Odtwarzam **${chosenFile}** na serwerze **${chosenGuild.name}** (kanał: **${targetChannel.name}**).`);
        }
    } catch (error) {
        console.error(`Błąd w komendzie ${cmd}:`, error);
        if (interaction.deferred || interaction.replied) {
            try {
                await interaction.editReply({ 
                    content: `❌ Wystąpił błąd krytyczny podczas wykonywania komendy ${cmd}.`, 
                });
            } catch { /* ignoruj, jeśli edycja nie zadziała */ }
        }
    }
});

client.login(TOKEN);