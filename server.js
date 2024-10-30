const express = require('express');
const { Client, GatewayIntentBits } = require('discord.js');
const cors = require('cors');
const config = require('./config.js');

const app = express();
const port = 3000;

// Update CORS settings
app.use(cors({
    origin: ['https://vigh24.github.io', 'http://localhost:8000'],
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Access-Control-Allow-Origin'],
    credentials: true
}));

// Initialize Discord client with all required intents
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.GuildMessageReactions
    ]
});

// Store games data
let gamesCache = [];

// Add this variable to store member count
let memberCount = 0;
let onlineMemberCount = 0;

// Function to format bytes into human readable size
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Function to extract game info from message
function parseGameMessage(message) {
    const attachments = Array.from(message.attachments.values());
    const isGameFile = attachments.some(att => 
        att.name.toLowerCase().endsWith('.zip') || 
        att.name.toLowerCase().endsWith('.rar') ||
        att.name.toLowerCase().endsWith('.7z')
    );

    if (isGameFile) {
        // Get the game name from either the message content or file name
        let gameName = message.content.split('\n')[0].trim();
        
        // If message content is empty, use file name without extension
        if (!gameName || gameName === '') {
            gameName = attachments[0].name.replace(/\.(zip|rar|7z)$/i, '');
        }

        // Clean up the game name
        gameName = gameName
            .replace(/\.zip$/i, '')
            .replace(/\.rar$/i, '')
            .replace(/\.7z$/i, '')
            .replace(/\[.*?\]/g, '') // Remove content in square brackets
            .trim();

        return {
            name: gameName,
            available: true,
            channel: message.channelId,
            messageId: message.id,
            size: formatFileSize(attachments[0].size),
            fileName: attachments[0].name,
            timestamp: message.createdTimestamp,
            postedBy: message.author.username,
            postedAt: new Date(message.createdTimestamp).toLocaleDateString()
        };
    }
    return null;
}

// Update games cache
async function updateGamesCache() {
    try {
        const channel = await client.channels.fetch(config.channelId);
        const messages = await channel.messages.fetch({ limit: 100 });
        
        gamesCache = messages
            .map(msg => parseGameMessage(msg))
            .filter(game => game !== null)
            .sort((a, b) => b.timestamp - a.timestamp);
            
        console.log(`Cache updated: ${gamesCache.length} games found`);
    } catch (error) {
        console.error('Error updating cache:', error);
    }
}

// Update member counts
async function updateMemberCounts() {
    try {
        const guild = await client.guilds.fetch(config.guildId);
        memberCount = guild.memberCount;
        
        // Get online members
        const members = await guild.members.fetch();
        onlineMemberCount = members.filter(member => 
            member.presence?.status === 'online' || 
            member.presence?.status === 'idle' || 
            member.presence?.status === 'dnd'
        ).size;
    } catch (error) {
        console.error('Error updating member counts:', error);
    }
}

// API endpoints
app.get('/api/games', (req, res) => {
    res.json(gamesCache);
});

app.get('/api/stats', (req, res) => {
    res.json({
        totalMembers: memberCount,
        onlineMembers: onlineMemberCount,
        totalGames: gamesCache.length
    });
});

// Discord bot events
client.once('ready', () => {
    console.log('Bot is ready!');
    updateGamesCache();
    updateMemberCounts();
    setInterval(updateGamesCache, 5 * 60 * 1000);
    setInterval(updateMemberCounts, 60 * 1000); // Update member count every minute
});

client.on('messageCreate', async (message) => {
    if (message.channelId === config.channelId) {
        await updateGamesCache();
    }
});

// Start the server
client.login(config.token);
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
}); 