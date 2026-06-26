process.env.FFMPEG_PATH = require('ffmpeg-static');

const { createAudioPlayer, createAudioResource, AudioPlayerStatus, joinVoiceChannel, StreamType } = require("@discordjs/voice");
const play = require("play-dl");
const { getData, getTracks } = require("spotify-url-info")(fetch);
const { spawn } = require("child_process");
const path = require("path");
const os = require("os");

const queues = new Map();

function replyAndDelete(msg, content, delay = 25000) {
  msg.reply(content).then((reply) => {
    setTimeout(() => reply.delete().catch(() => {}), delay);
  }).catch((err) => {
    console.error('⚠️ Erro ao enviar resposta:', err.message);
  });
}

function createQueue(guild, voiceChannel, options = {}) {
  killCurrentProcess(queues.get(guild.id));

  const connection = joinVoiceChannel({
    channelId: voiceChannel.id,
    guildId: guild.id,
    adapterCreator: guild.voiceAdapterCreator,
    selfMute: options.selfMute || false,
    selfDeaf: false
  });

  const player = createAudioPlayer();

  const queue = {
    connection,
    player,
    voiceChannelId: voiceChannel.id,
    selfMuted: options.selfMute || false,
    songs: [],
    loop: false,
    currentProcess: null,
    isSkipping: false
  };

  connection.subscribe(player);
  queues.set(guild.id, queue);

  console.log(`🔊 Bot entrou no canal de voz: ${voiceChannel.name} (${voiceChannel.id})`);

  connection.on('stateChange', (oldState, newState) => {
    console.log(`📡 Connection state: ${oldState.status} -> ${newState.status}`);
  });

  connection.on('error', (error) => {
    console.error('❌ Erro na conexão de voz:', error);
  });

  player.on(AudioPlayerStatus.Idle, () => {
    console.log('⏹️ Player ficou idle, passando pra próxima...');
    killCurrentProcess(queue);
    if (queue.isSkipping) {
      console.log('⏭️ Skip em andamento, ignorando evento idle');
      queue.isSkipping = false;
      return;
    }
    if (!queue.loop) queue.songs.shift();
    playNext(guild.id);
  });

  player.on(AudioPlayerStatus.Playing, () => {
    console.log('▶️ Player começou a tocar!');
  });

  player.on('error', (error) => {
    console.error('❌ Erro no player:', error);
    killCurrentProcess(queue);
    queue.songs.shift();
    playNext(guild.id);
  });

  return queue;
}

async function execute(msg, args) {
  console.log(`📝 Comando play recebido: ${args.join(' ')}`);

  const voiceChannel = msg.member?.voice?.channel;
  if (!voiceChannel) {
    replyAndDelete(msg, "❌ Entre em um canal de voz!");
    return;
  }

  let queue = queues.get(msg.guild.id);

  const needsUnmute = queue && queue.selfMuted === true;

  if (!queue || queue.voiceChannelId !== voiceChannel.id || needsUnmute) {
    if (queue) {
      if (queue.voiceChannelId !== voiceChannel.id) {
        console.log('🔄 Usuário em outro canal de voz. Saindo do canal atual...');
      } else {
        console.log('🔊 Desmutando bot para tocar música...');
      }
      killCurrentProcess(queue);
      queue.connection.destroy();
      queues.delete(msg.guild.id);
    }
    queue = createQueue(msg.guild, voiceChannel, { selfMute: false });
  }

  try {
    const firstArg = args[0];
    const youtubeUrlRegex = /(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
    const youtubeMatch = firstArg.match(youtubeUrlRegex);
    const spotifyRegex = /(?:open\.spotify\.com|spotify\.link)(?:\/[a-z-]+)?\/(track|album|playlist)\/([a-zA-Z0-9]+)/;
    const spotifyMatch = firstArg.match(spotifyRegex);

    let songsToAdd = [];

    if (youtubeMatch) {
      songsToAdd.push({ url: `https://www.youtube.com/watch?v=${youtubeMatch[1]}`, original: firstArg });
    } else if (play.yt_validate(firstArg) === "video") {
      songsToAdd.push({ url: firstArg, original: firstArg });
    } else if (spotifyMatch) {
      console.log(`🎵 Link do Spotify detectado: ${firstArg}`);
      console.log(`📋 Tipo: ${spotifyMatch[1]}, ID: ${spotifyMatch[2]}`);
      const spotifySongs = await getSpotifySongs(firstArg, spotifyMatch);
      if (!spotifySongs.length) {
        replyAndDelete(msg, "❌ Não foi possível obter músicas do Spotify! Verifique se o link está correto e é público.");
        return;
      }
      songsToAdd = spotifySongs;
      console.log(`✅ ${songsToAdd.length} música(s) obtida(s) do Spotify`);
    } else {
      const result = await play.search(args.join(" "), { limit: 1 });
      if (!result.length) {
        replyAndDelete(msg, "❌ Música não encontrada!");
        return;
      }
      songsToAdd.push({ url: result[0].url, original: args.join(" ") });
    }

    if (!songsToAdd.length) {
      replyAndDelete(msg, "❌ Nenhuma música encontrada!");
      return;
    }

    for (const song of songsToAdd) {
      if (!song || typeof song !== 'object' || !song.url) continue;
      queue.songs.push(song);
      const position = queue.songs.length;
      console.log(`🎵 Música adicionada à fila na posição ${position}: ${song.url}`);

      if (position === 1) {
        const displayName = song.original !== song.url ? `🎵 ${song.original}` : `🎶 Tocando agora: ${song.url}`;
        replyAndDelete(msg, displayName);
        console.log('🎵 Iniciando reprodução da primeira música...');
        playNext(msg.guild.id);
      } else {
        const displayName = song.original && song.original !== song.url 
          ? `🎶 Adicionado à fila na posição ${position}: ${song.original}` 
          : `🎶 Adicionado à fila na posição ${position}: ${song.url}`;
        replyAndDelete(msg, displayName);
      }
    }
  } catch (searchErr) {
    console.error('Erro ao buscar/validar música:', searchErr);
    replyAndDelete(msg, "❌ Erro ao processar a música. Tente outro link ou nome.");
  }
}

async function validateSpotifyUrl(url, match) {
  try {
    const type = match[1]; // track, album, playlist
    const id = match[2];

    console.log(`🔍 Validando URL do Spotify:`);
    console.log(`   Tipo: ${type}`);
    console.log(`   ID: ${id}`);
    console.log(`   URL completa: ${url}`);

    // Validações básicas
    if (!id || id.length < 10) {
      console.error(`❌ ID do Spotify inválido: ${id}`);
      return { valid: false, error: 'ID do Spotify inválido' };
    }

    if (!['track', 'album', 'playlist'].includes(type)) {
      console.error(`❌ Tipo de URL do Spotify não suportado: ${type}`);
      return { valid: false, error: `Tipo '${type}' não suportado. Use track, album ou playlist.` };
    }

    return { valid: true, type, id };
  } catch (err) {
    console.error('❌ Erro na validação da URL do Spotify:', err.message);
    return { valid: false, error: err.message };
  }
}

async function getSpotifySongs(spotifyUrl, spotifyMatch) {
  try {
    console.log(`\n${'='.repeat(50)}`);
    console.log(`🎧 INICIANDO PROCESSAMENTO DO SPOTIFY`);
    console.log(`${'='.repeat(50)}`);
    console.log(`🔗 URL: ${spotifyUrl}`);

    // Valida a URL primeiro
    const validation = await validateSpotifyUrl(spotifyUrl, spotifyMatch);
    if (!validation.valid) {
      console.error(`❌ Validação falhou: ${validation.error}`);
      return [];
    }

    console.log(`✅ URL válida! Obtendo dados do Spotify...`);

    // Tenta obter os dados com timeout
    let tracks;
    try {
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout: Spotify demorou demais para responder')), 15000)
      );

      tracks = await Promise.race([
        getTracks(spotifyUrl),
        timeoutPromise
      ]);

      if (!Array.isArray(tracks)) {
        console.error(`❌ Resposta inválida do Spotify: ${typeof tracks}`);
        console.error(`   Dados recebidos: ${JSON.stringify(tracks).substring(0, 200)}`);
        return [];
      }

      console.log(`✅ ${tracks.length} faixa(s) obtida(s) do Spotify`);
      
      if (tracks.length === 0) {
        console.log(`⚠️ Spotify retornou lista vazia`);
        return [];
      }

      // Log das tracks obtidas
      tracks.forEach((track, index) => {
        console.log(`   ${index + 1}. ${track.artist} - ${track.name}`);
      });

    } catch (err) {
      console.error(`❌ Erro ao obter dados do Spotify: ${err.message}`);
      
      // Tratamento de erros específicos
      if (err.message.includes('Timeout')) {
        console.error(`   ⏰ A requisição demorou mais de 15 segundos`);
      } else if (err.message.includes('404') || err.message.includes('not found')) {
        console.error(`   🔗 URL não encontrada. Verifique se o link está correto.`);
      } else if (err.message.includes('403') || err.message.includes('forbidden')) {
        console.error(`   🚫 Acesso negado. O conteúdo pode ser privado ou restrito.`);
      } else if (err.message.includes('fetch') || err.message.includes('network')) {
        console.error(`   🌐 Erro de rede. Verifique sua conexão com a internet.`);
      }
      
      console.error(`   Stack trace: ${err.stack.split('\n').slice(1, 3).join('\n')}`);
      return [];
    }

    // Busca cada track no YouTube
    const songsArray = [];
    let successCount = 0;
    let failCount = 0;

    console.log(`\n🔍 Buscando correspondências no YouTube...`);

    for (let i = 0; i < tracks.length; i++) {
      const track = tracks[i];
      
      try {
        // Valida dados da track
        if (!track.artist || !track.name) {
          console.warn(`   ⚠️ Track ${i + 1} sem artista ou nome, pulando...`);
          failCount++;
          continue;
        }

        const query = `${track.artist} - ${track.name}`;
        console.log(`   [${i + 1}/${tracks.length}] Buscando: ${query}`);

        const result = await play.search(query, { limit: 1 });
        
        if (result && result.length > 0 && result[0].url) {
          console.log(`   ✅ Encontrado: ${result[0].title || 'N/A'}`);
          console.log(`      URL YouTube: ${result[0].url}`);
          // Adiciona no formato objeto com URL original do Spotify
          songsArray.push({
            url: result[0].url,
            original: spotifyUrl
          });
          successCount++;
        } else {
          console.warn(`   ❌ Não encontrado no YouTube: ${query}`);
          failCount++;
        }

        // Pequeno delay para evitar rate limiting
        if (i < tracks.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }

      } catch (trackErr) {
        console.error(`   ❌ Erro ao processar track ${i + 1}: ${trackErr.message}`);
        failCount++;
        continue;
      }
    }

    console.log(`\n${'='.repeat(50)}`);
    console.log(`📊 RESUMO DO PROCESSAMENTO`);
    console.log(`${'='.repeat(50)}`);
    console.log(`   Total de tracks: ${tracks.length}`);
    console.log(`   Encontradas no YouTube: ${successCount}`);
    console.log(`   Não encontradas: ${failCount}`);
    console.log(`   URLs retornadas: ${songsArray.length}`);
    console.log(`${'='.repeat(50)}\n`);

    return songsArray;

  } catch (err) {
    console.error(`\n❌ ERRO CRÍTICO AO PROCESSAR SPOTIFY:`);
    console.error(`   Mensagem: ${err.message}`);
    console.error(`   Stack: ${err.stack}`);
    console.error(`   URL: ${spotifyUrl}\n`);
    return [];
  }
}

async function playNext(guildId) {
  const queue = queues.get(guildId);
  if (!queue || queue.songs.length === 0) return;

  const song = queue.songs[0];

  // Proteção contra URL inválida/undefined (race condition)
  if (!song || typeof song !== 'object' || !song.url || typeof song.url !== 'string') {
    queue.songs.shift();
    playNext(guildId);
    return;
  }

  try {
    // Mata o processo anterior se existir
    killCurrentProcess(queue);

    const ytdlpPath = os.platform() === 'win32' 
      ? path.join(__dirname, 'node_modules', 'youtube-dl-exec', 'bin', 'yt-dlp.exe')
      : path.join(__dirname, 'bin', 'yt-dlp');
    const ytdlpProcess = spawn(ytdlpPath, [
      song.url,
      '--output', '-',
      '--format', 'bestaudio[ext=webm]/bestaudio/best',
      '--no-playlist',
      '--no-warnings',
      '--quiet',
      '--no-check-certificates',
      '--prefer-free-formats',
      '--no-cache-dir',
      '--socket-timeout', '10',
      '--retries', '2'
    ], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stderrData = '';
    ytdlpProcess.stderr.on('data', (chunk) => {
      stderrData += chunk.toString();
    });

    ytdlpProcess.on('error', (err) => {
      console.error('❌ Erro no processo yt-dlp:', err.message);
    });

    ytdlpProcess.on('close', (code, signal) => {
      // Só loga se foi encerrado por sinal (skip/stop) ou erro
      if (signal) {
        console.log(`📤 yt-dlp encerrado (sinal: ${signal})`);
      } else if (code !== 0) {
        console.error(`❌ yt-dlp falhou (código: ${code})`);
        if (stderrData) {
          console.error(`   stderr: ${stderrData.substring(0, 200)}`);
        }
      }
      // código 0 = sucesso, não precisa logar
    });

    queue.currentProcess = ytdlpProcess;

    const resource = createAudioResource(ytdlpProcess.stdout, {
      inputType: StreamType.Arbitrary,
      inlineVolume: false
    });

    // Verifica se a fila ainda existe (pode ter sido parada durante o await)
    const currentQueue = queues.get(guildId);
    if (!currentQueue || currentQueue.songs[0] !== song) {
      console.log('⚠️ Fila mudou durante o carregamento, cancelando reprodução.');
      return;
    }

    currentQueue.player.play(resource);
  } catch (err) {
    console.error('❌ Erro ao tocar:', err.message, '| URL:', song.url);
    console.error(err.stack);
    const currentQueue = queues.get(guildId);
    if (currentQueue && currentQueue.songs[0] === song) {
      currentQueue.songs.shift();
      playNext(guildId);
    }
  }
}

function killCurrentProcess(queue) {
  if (queue && queue.currentProcess && !queue.currentProcess.killed) {
    try {
      queue.currentProcess.kill();
    } catch (err) {
      // Erro ao matar processo - pode já ter terminado
    }
    queue.currentProcess = null;
  }
}

function skip(msg) {
  try {
    const queue = queues.get(msg.guild.id);
    if (!queue) {
      replyAndDelete(msg, "❌ Nada tocando!");
      return;
    }
    if (queue.songs.length === 0) {
      replyAndDelete(msg, "❌ Fila vazia!");
      return;
    }

    console.log('⏭️ Comando skip recebido');
    queue.isSkipping = true;
    killCurrentProcess(queue);
    queue.songs.shift();
    queue.player.stop();
    replyAndDelete(msg, "⏭️ Música pulada!");

    if (queue.songs.length > 0) {
      console.log('🎵 Iniciando próxima música após skip...');
      playNext(msg.guild.id);
    } else {
      console.log('📭 Fila vazia após skip');
      queue.isSkipping = false;
    }
  } catch (err) {
    console.error('❌ Erro no skip:', err);
    console.error(err.stack);
    replyAndDelete(msg, '❌ Erro ao pular música!');
  }
}

function stop(msg) {
  const queue = queues.get(msg.guild.id);
  if (!queue) {
    replyAndDelete(msg, "❌ Nada tocando!");
    return;
  }

  killCurrentProcess(queue);
  queue.songs = [];
  queue.player.stop();
  replyAndDelete(msg, "🛑 Parado!");
}

function pause(msg) {
  const queue = queues.get(msg.guild.id);
  if (!queue) {
    replyAndDelete(msg, "❌ Nada tocando!");
    return;
  }
  queue.player.pause();
  replyAndDelete(msg, "⏸️ Pausado!");
}

function resume(msg) {
  const queue = queues.get(msg.guild.id);
  if (!queue) {
    replyAndDelete(msg, "❌ Nada tocando!");
    return;
  }
  queue.player.unpause();
  replyAndDelete(msg, "▶️ Retomado!");
}

function queueList(msg) {
  const queue = queues.get(msg.guild.id);
  if (!queue || queue.songs.length === 0) {
    replyAndDelete(msg, "❌ Fila vazia!");
    return;
  }

  const queueDisplay = queue.songs.map((s, i) => {
    const displayName = s.original && s.original !== s.url ? s.original : s.url;
    return `${i + 1}. ${displayName}`;
  }).join("\n");

  replyAndDelete(msg, "📜 Fila:\n" + queueDisplay);
}

function loop(msg) {
  const queue = queues.get(msg.guild.id);
  if (!queue) {
    replyAndDelete(msg, "❌ Nada tocando!");
    return;
  }

  queue.loop = !queue.loop;
  replyAndDelete(msg, `🔁 Loop ${queue.loop ? "ativado" : "desativado"}`);
}

function leave(msg) {
  const queue = queues.get(msg.guild.id);
  if (!queue) {
    replyAndDelete(msg, "❌ Não estou em call!");
    return;
  }

  // Mata o processo de áudio primeiro
  killCurrentProcess(queue);
  
  // Para o player para evitar eventos Idle
  try {
    queue.player.stop();
  } catch (err) {
    // Player pode já estar parado
  }
  
  // Limpa a fila
  queue.songs = [];
  
  // Destroi a conexão de voz
  try {
    queue.connection.destroy();
  } catch (err) {
    // Conexão pode já estar destruída
  }
  
  // Remove a queue
  queues.delete(msg.guild.id);
  
  replyAndDelete(msg, "🚪 Sai da call!");
}

function callon(msg) {
  const voiceChannel = msg.member?.voice?.channel;
  if (!voiceChannel) {
    replyAndDelete(msg, "❌ Entre em um canal de voz!");
    return;
  }

  let queue = queues.get(msg.guild.id);
  if (queue && queue.voiceChannelId === voiceChannel.id) {
    replyAndDelete(msg, "🔊 Já estou nesse canal de voz!");
    return;
  }

  if (queue) {
    killCurrentProcess(queue);
    queue.connection.destroy();
    queues.delete(msg.guild.id);
  }

  createQueue(msg.guild, voiceChannel, { selfMute: true });
  replyAndDelete(msg, `🔊 Entrei no canal: ${voiceChannel.name} (mutado)`);
}

function calloff(msg) {
  const queue = queues.get(msg.guild.id);
  if (!queue) {
    replyAndDelete(msg, "❌ Não estou em nenhum canal de voz!");
    return;
  }

  // Mata o processo de áudio primeiro
  killCurrentProcess(queue);
  
  // Para o player para evitar eventos Idle
  try {
    queue.player.stop();
  } catch (err) {
    // Player pode já estar parado
  }
  
  // Limpa a fila
  queue.songs = [];
  
  // Destroi a conexão de voz
  try {
    queue.connection.destroy();
  } catch (err) {
    // Conexão pode já estar destruída
  }
  
  // Remove a queue
  queues.delete(msg.guild.id);
  
  replyAndDelete(msg, "🚪 Saí do canal de voz!");
}

module.exports = { execute, skip, stop, pause, resume, queueList, loop, leave, callon, calloff };
