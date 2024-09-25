// IMPORTAÇÕES
const { Client, GatewayIntentBits } = require('discord.js');

const { joinVoiceChannel, createAudioPlayer, createAudioResource } = require('@discordjs/voice');

const ytdl = require('@distube/ytdl-core');

const axios = require('axios');

const SpotifyWebApi = require('spotify-web-api-node');

require('dotenv').config();

// INICIO DO CODIGO
const spotifyApi = new SpotifyWebApi({

    clientId: process.env.SPOTIFY_CLIENT_ID,
    clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
    redirectUri: 'http://localhost:8888/callback'

});

async function authenticateSpotify() {

    try {

        const data = await spotifyApi.clientCredentialsGrant();
        spotifyApi.setAccessToken(data.body['access_token']);
        console.log('Access token do Spotify obtido:', data.body['access_token']);

    } catch (error) {

        console.error('Erro ao obter token de acesso do Spotify:', error);

    }

}

const client = new Client({

    intents: [

        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,

    ],

});

const youtubeApiKey = process.env.YOUTUBE_API_KEY;

client.once('ready', () => {

    console.log('Bot está online!');
    authenticateSpotify();

});

client.on('messageCreate', async (message) => {

    if (message.content.startsWith('.play')) {

        const args = message.content.split(' ').slice(1);
        let searchQuery = args.join(' ');

        if (!searchQuery) {

            return message.channel.send('Por favor, forneça um link ou o nome de uma música.');

        }

        const voiceChannel = message.member.voice.channel;

        if (!voiceChannel) {

            return message.channel.send('Você precisa estar em um canal de voz para tocar música!');

        }

        let youtubeUrl;

        if (ytdl.validateURL(searchQuery)) {

            youtubeUrl = searchQuery;

        } else if (searchQuery.includes('spotify.com')) {

            try {

                const trackId = searchQuery.split('/').pop();
                const spotifyData = await spotifyApi.getTrack(trackId);
                const trackName = spotifyData.body.name;
                const artistName = spotifyData.body.artists.map(artist => artist.name).join(', ');

                if (trackName) {

                    youtubeUrl = await searchYouTube(`${trackName} ${artistName}`);

                } else {

                    return message.channel.send('Não foi possível encontrar a música no YouTube.');

                }

            } catch (error) {

                console.error('Erro ao obter informações do Spotify:', error);
                return message.channel.send('Erro ao obter informações do Spotify.');

            }
        } else {

            youtubeUrl = await searchYouTube(searchQuery);

            if (!youtubeUrl) {

                return message.channel.send('Não foi possível encontrar a música no YouTube.');

            }

        }

        const connection = joinVoiceChannel({

            channelId: voiceChannel.id,
            guildId: message.guild.id,
            adapterCreator: message.guild.voiceAdapterCreator,

        });

        const playStream = (retries = 3) => {

            const stream = ytdl(youtubeUrl, { filter: 'audioonly' });

            stream.on('error', (error) => {

                console.error('Erro ao obter o stream do YouTube:', error);

                if (retries > 0) {

                    console.log(`Tentando novamente... (restantes: ${retries})`);
                    playStream(retries - 1);

                } else {

                    message.channel.send('Erro ao tentar obter o stream da música.');

                    if (connection) {

                        connection.destroy();

                    }

                }

            });

            const resource = createAudioResource(stream);

            const player = createAudioPlayer();
            player.play(resource);
            connection.subscribe(player);

            message.channel.send(`Tocando: ${youtubeUrl}`);

            player.on('finish', () => {

                if (connection) {

                    connection.destroy();

                }

                message.channel.send('Música terminou de tocar.');

            });

            player.on('error', (error) => {

                console.error('Erro no player de áudio:', error);
                message.channel.send('Ocorreu um erro ao tentar tocar a música.');

                if (connection) {

                    connection.destroy();

                }

            });

        };

        playStream();

    }

});

async function searchYouTube(query) {

    try {

        await new Promise(resolve => setTimeout(resolve, 1000));

        const response = await axios.get('https://www.googleapis.com/youtube/v3/search', {

            params: {

                part: 'snippet',
                q: query,
                key: youtubeApiKey,
                type: 'video',
                maxResults: 1,

            },

        });

        const videoId = response.data.items[0]?.id?.videoId;

        if (videoId) {

            return `https://www.youtube.com/watch?v=${videoId}`;

        } else {

            return null;

        }

    } catch (error) {

        console.error('Erro ao buscar no YouTube:', error);
        return null;

    }

}

client.login(process.env.DISCORD_BOT_TOKEN);
