const config = require('./config');
const { Client, GatewayIntentBits, EmbedBuilder, Partials, PermissionsBitField, AttachmentBuilder } = require('discord.js');
const music = require('./music');
const logs = require('./logs');
const registro = require('./registro');
const verificacao = require('./verificacao');
const tickets = require('./tickets');
const ticketsTransferencia = require('./tickets-transferencia');
const ticketsPrioridade = require('./tickets-prioridade');
const fs = require('fs');
const path = require('path');

// ──────────────────────────────────────────
// ANÚNCIOS
// ──────────────────────────────────────────

const ADS_FILE = path.join(__dirname, 'ads.json');

function loadAds() {
  try {
    const data = fs.readFileSync(ADS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Erro ao carregar anúncios:', error);
    return { ads: [] };
  }
}

function saveAds(data) {
  try {
    fs.writeFileSync(ADS_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (error) {
    console.error('Erro ao salvar anúncios:', error);
  }
}

// ──────────────────────────────────────────
// CONFIGURAÇÃO DO BOT
// ──────────────────────────────────────────

const useGuildMembersIntent = process.env.ENABLE_GUILD_MEMBERS === 'true';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.DirectMessages,
    ...(useGuildMembersIntent ? [GatewayIntentBits.GuildMembers] : []),
  ],
  partials: [Partials.Channel],
});

const PREFIX = config.prefix;
const TOKEN = config.token;
const AD_CHANNEL_IDS = config.adChannelIds;

client.once('ready', () => {
  console.log(`✅ Bot online como: ${client.user.tag}`);
  console.log(`📢 Canais de anúncios configurados: ${AD_CHANNEL_IDS.length}`);
  AD_CHANNEL_IDS.forEach((id) => console.log(`   - Canal ID: ${id}`));
});

// ──────────────────────────────────────────
// LIMPAR CANAL
// ──────────────────────────────────────────

async function limparCanal(message) {
  if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
    return message.channel.send('❌ Apenas **administradores** podem usar este comando!');
  }

  if (!message.guild.members.me.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
    return message.channel.send('❌ Eu preciso da permissão **Gerenciar Mensagens** para limpar o canal!');
  }

  try {
    await message.delete().catch(() => {});

    const fetched = await message.channel.messages.fetch({ limit: 100 });
    const twoWeeksAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;
    const deletable = fetched.filter((msg) => msg.createdTimestamp > twoWeeksAgo);

    await message.channel.bulkDelete(deletable, true);
    const reply = await message.channel.send(`🧹 ${deletable.size} mensagem(ns) apagada(s)!`);
    setTimeout(() => reply.delete().catch(() => {}), 5000);
  } catch (err) {
    console.error('❌ Erro ao limpar canal:', err);
    return message.channel.send('❌ Não foi possível limpar o canal. Verifique minhas permissões.');
  }
}

// ──────────────────────────────────────────
// PROCESSAR MENSAGENS
// ──────────────────────────────────────────

// Deduplicação: ignora mensagens já processadas (evita respostas duplicadas)
const _processedMsgs = new Set();

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (!message.content.startsWith(PREFIX)) return;
  if (_processedMsgs.has(message.id)) return;
  _processedMsgs.add(message.id);
  setTimeout(() => _processedMsgs.delete(message.id), 10000);

  // Intercepta replies para apagar automaticamente após 25 segundos
  const originalReply = message.reply.bind(message);
  message.reply = async function (...replyArgs) {
    const reply = await originalReply(...replyArgs);
    setTimeout(() => reply.delete().catch(() => {}), 25000);
    return reply;
  };

  const args = message.content.slice(PREFIX.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  const validCommands = [
    'addad', 'myads', 'allads', 'sendads', 'removead', 'clearads',
    'play', 'p', 'tocar',
    'skip', 's', 'pular',
    'stop', 'parar',
    'pause', 'pausar',
    'resume', 'despausar', 'continuar',
    'queue', 'q', 'fila',
    'loop',
    'leave', 'sair', 'disconnect',
    'callon', 'calloff',
    'limpa', 'clear', 'limpar',
    'ajuda', 'help'
  ];

  // Comandos que DEVEM auto-apagar após 25 segundos
  const autoDeleteCommands = [
    'addad', 'myads', 'allads', 'sendads', 'removead', 'clearads',
    'play', 'p', 'tocar',
    'skip', 's', 'pular',
    'stop', 'parar',
    'pause', 'pausar',
    'resume', 'despausar', 'continuar',
    'queue', 'q', 'fila',
    'loop',
    'leave', 'sair', 'disconnect',
    'callon', 'calloff',
    'limpa', 'clear', 'limpar',
    'prioridade'
  ];

  if (autoDeleteCommands.includes(command)) {
    setTimeout(() => {
      message.delete().catch((err) => {
        console.log('⚠️ Não foi possível apagar a mensagem:', err.message);
      });
    }, 25000);
  }

  switch (command) {

    // ══════════════════════════════════════
    // COMANDOS DE ANÚNCIOS
    // ══════════════════════════════════════

    case 'addad': {
      const parts = args.join(' ').split('|').map((p) => p.trim());
      if (parts.length < 2) {
        return message.reply(
          '❌ Uso correto: `!addad <titulo> | <descricao> | [preco]`\n' +
          'Exemplo: `!addad Camiseta | Camiseta preta tamanho G | R$ 50,00`'
        );
      }

      const [titulo, descricao, preco] = parts;
      const adsData = loadAds();
      const newAd = {
        id: Date.now(),
        titulo,
        descricao,
        preco: preco || 'Consultar',
        criadoEm: new Date().toLocaleString('pt-BR'),
        autorId: message.author.id,
        autorNome: message.author.username,
      };

      adsData.ads.push(newAd);
      saveAds(adsData);

      const embed = new EmbedBuilder()
        .setColor('#00FF00')
        .setTitle('✅ Anúncio Adicionado!')
        .addFields(
          { name: '📌 Título', value: titulo, inline: true },
          { name: '📝 Descrição', value: descricao, inline: false },
          { name: '💰 Preço', value: preco || 'Consultar', inline: true },
          { name: '🆔 ID', value: String(newAd.id), inline: true }
        )
        .setTimestamp();

      return message.reply({ embeds: [embed] });
    }

    case 'myads': {
      const adsData = loadAds();
      const myAds = adsData.ads.filter((ad) => ad.autorId === message.author.id);

      if (myAds.length === 0) {
        return message.reply('📭 Você não tem anúncios cadastrados. Use `!addad` para criar um!');
      }

      const embed = new EmbedBuilder()
        .setColor('#0099FF')
        .setTitle(`📋 Seus Anúncios (${myAds.length})`)
        .setTimestamp();

      myAds.slice(0, 25).forEach((ad) => {
        embed.addFields({
          name: `${ad.titulo} (ID: ${ad.id})`,
          value: `${ad.descricao}\n💰 ${ad.preco}`,
          inline: false,
        });
      });

      return message.reply({ embeds: [embed] });
    }

    case 'allads': {
      const adsData = loadAds();

      if (adsData.ads.length === 0) {
        return message.reply('📭 Nenhum anúncio cadastrado ainda. Use `!addad` para criar!');
      }

      const embed = new EmbedBuilder()
        .setColor('#FFD700')
        .setTitle(`📋 Todos os Anúncios (${adsData.ads.length})`)
        .setTimestamp();

      adsData.ads.slice(0, 25).forEach((ad) => {
        embed.addFields({
          name: `${ad.titulo} — por ${ad.autorNome}`,
          value: `${ad.descricao}\n💰 ${ad.preco} | 🆔 ${ad.id}`,
          inline: false,
        });
      });

      return message.reply({ embeds: [embed] });
    }

    case 'sendads': {
      const adsData = loadAds();

      if (adsData.ads.length === 0) {
        return message.reply('📭 Nenhum anúncio cadastrado para enviar. Use `!addad` primeiro!');
      }

      if (AD_CHANNEL_IDS.length === 0) {
        return message.reply(
          '⚠️ Nenhum canal de anúncios configurado!\n' +
          'Adicione os IDs dos canais no arquivo `.env` em `AD_CHANNEL_IDS`.'
        );
      }

      await message.reply(`📤 Enviando ${adsData.ads.length} anúncio(s) para ${AD_CHANNEL_IDS.length} canal(is)...`);

      let successCount = 0;
      let failCount = 0;

      for (const channelId of AD_CHANNEL_IDS) {
        try {
          const channel = await client.channels.fetch(channelId.trim());

          if (!channel || !channel.isTextBased()) {
            failCount++;
            continue;
          }

          for (const ad of adsData.ads) {
            const embed = new EmbedBuilder()
              .setColor('#FF6600')
              .setTitle(`📢 ${ad.titulo}`)
              .setDescription(ad.descricao)
              .addFields(
                { name: '💰 Preço', value: ad.preco, inline: true },
                { name: '👤 Vendedor', value: `<@${ad.autorId}>`, inline: true }
              )
              .setFooter({ text: `Anúncio publicado por ${ad.autorNome}` })
              .setTimestamp();

            await channel.send({ embeds: [embed] });
            await new Promise((resolve) => setTimeout(resolve, 500));
          }

          successCount++;
        } catch (error) {
          console.error(`Erro ao enviar para canal ${channelId}:`, error.message);
          failCount++;
        }
      }

      const resultEmbed = new EmbedBuilder()
        .setColor(successCount > 0 ? '#00FF00' : '#FF0000')
        .setTitle('📊 Resultado do Envio')
        .addFields(
          { name: '✅ Sucesso', value: `${successCount} canal(is)`, inline: true },
          { name: '❌ Falha', value: `${failCount} canal(is)`, inline: true },
          { name: '📢 Anúncios enviados', value: `${adsData.ads.length}`, inline: true }
        )
        .setTimestamp();

      return message.reply({ embeds: [resultEmbed] });
    }

    case 'removead': {
      const adId = args[0];
      if (!adId) {
        return message.reply('❌ Use: `!removead <id_do_anuncio>`\nUse `!myads` para ver seus anúncios.');
      }

      const adsData = loadAds();
      const adIndex = adsData.ads.findIndex(
        (ad) => String(ad.id) === adId && ad.autorId === message.author.id
      );

      if (adIndex === -1) {
        return message.reply('❌ Anúncio não encontrado ou você não é o dono dele.');
      }

      const removed = adsData.ads.splice(adIndex, 1)[0];
      saveAds(adsData);

      return message.reply(`✅ Anúncio "${removed.titulo}" removido com sucesso!`);
    }

    case 'clearads': {
      const adsData = loadAds();
      const before = adsData.ads.length;
      adsData.ads = adsData.ads.filter((ad) => ad.autorId !== message.author.id);
      const removed = before - adsData.ads.length;
      saveAds(adsData);

      return message.reply(`✅ ${removed} anúncio(s) removido(s).`);
    }

    // ══════════════════════════════════════
    // COMANDOS DE MÚSICA (via music.js)
    // ══════════════════════════════════════

    case 'play':
    case 'p':
    case 'tocar': {
      if (!args.length) {
        return message.reply('❌ Use: `!play <nome da música ou URL do YouTube>`');
      }
      try {
        return await music.execute(message, args);
      } catch (err) {
        console.error('Erro no !play:', err);
        return message.reply('❌ Erro ao executar comando de música!');
      }
    }

    case 'skip':
    case 's':
    case 'pular':
      try { return music.skip(message); } catch (err) { console.error(err); return message.reply('❌ Erro ao pular!'); }

    case 'stop':
    case 'parar':
      try { return music.stop(message); } catch (err) { console.error(err); return message.reply('❌ Erro ao parar!'); }

    case 'pause':
    case 'pausar':
      try { return music.pause(message); } catch (err) { console.error(err); return message.reply('❌ Erro ao pausar!'); }

    case 'resume':
    case 'despausar':
    case 'continuar':
      try { return music.resume(message); } catch (err) { console.error(err); return message.reply('❌ Erro ao retomar!'); }

    case 'queue':
    case 'q':
    case 'fila':
      try { return music.queueList(message); } catch (err) { console.error(err); return message.reply('❌ Erro ao mostrar fila!'); }

    case 'loop':
      try { return music.loop(message); } catch (err) { console.error(err); return message.reply('❌ Erro no loop!'); }

    case 'leave':
    case 'sair':
    case 'disconnect':
      try { return music.leave(message); } catch (err) { console.error(err); return message.reply('❌ Erro ao sair!'); }

    case 'callon':
      try { return music.callon(message); } catch (err) { console.error(err); return message.reply('❌ Erro ao entrar na call!'); }

    case 'calloff':
      try { return music.calloff(message); } catch (err) { console.error(err); return message.reply('❌ Erro ao sair da call!'); }

    case 'limpa':
    case 'clear':
    case 'limpar':
      try { return await limparCanal(message); } catch (err) { console.error(err); return message.reply('❌ Erro ao limpar o canal!'); }

    // ══════════════════════════════════════
    // AJUDA
    // ══════════════════════════════════════

    case 'ajuda':
    case 'help': {
      const helpImagePath = path.join(__dirname, 'assets', 'help-bg.jpg');
      const helpAttachment = fs.existsSync(helpImagePath)
        ? new AttachmentBuilder(helpImagePath, { name: 'help-bg.jpg' })
        : null;

      const helpEmbed = new EmbedBuilder()
        .setColor('#7289DA')
        .setTitle('🤖 Bot de Anúncios & Música — Comandos')
        .setDescription('Gerencie anúncios e toque música no servidor!')
        .setImage(helpAttachment ? 'attachment://help-bg.jpg' : null)
        .addFields(
          { name: '── 📢 Anúncios ──', value: '\u200b', inline: false },
          {
            name: '!addad <titulo> | <descricao> | [preco]',
            value: 'Cadastra um novo anúncio.',
            inline: false,
          },
          {
            name: '!myads',
            value: 'Lista todos os seus anúncios.',
            inline: false,
          },
          {
            name: '!allads',
            value: 'Lista todos os anúncios cadastrados.',
            inline: false,
          },
          {
            name: '!sendads',
            value: 'Envia todos os anúncios para os canais configurados.',
            inline: false,
          },
          {
            name: '!removead <id>',
            value: 'Remove um anúncio específico.',
            inline: false,
          },
          {
            name: '!clearads',
            value: 'Remove todos os seus anúncios.',
            inline: false,
          },
          { name: '── 🎵 Música ──', value: '\u200b', inline: false },
          {
            name: '!play <nome ou URL>',
            value: 'Toca uma música (YouTube) ou adiciona à fila.',
            inline: false,
          },
          {
            name: '!skip',
            value: 'Pula para a próxima música.',
            inline: false,
          },
          {
            name: '!stop',
            value: 'Para a música e limpa a fila.',
            inline: false,
          },
          {
            name: '!pause / !resume',
            value: 'Pausa ou retoma a música atual.',
            inline: false,
          },
          {
            name: '!queue',
            value: 'Mostra a fila de músicas.',
            inline: false,
          },
          {
            name: '!loop',
            value: 'Ativa/desativa o loop da música atual.',
            inline: false,
          },
          {
            name: '!leave',
            value: 'Faz o bot sair do canal de voz.',
            inline: false,
          },
          {
            name: '!registro-painel',
            value: 'Cria painel de registro de facção. Configure os canais no .env!',
            inline: false,
          }
        )
        .setFooter({ text: 'Feito com ❤️ para gerenciar seus anúncios e tocar suas músicas!' });

      const replyPayload = { embeds: [helpEmbed] };
      if (helpAttachment) replyPayload.files = [helpAttachment];

      return message.reply(replyPayload);
    }

    // ══════════════════════════════════════
    // COMANDOS DE REGISTRO
    // ══════════════════════════════════════

    case 'registro-painel': {
      if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        // Usa reply original sem auto-delete para mensagens de erro
        const originalReply = message.channel.send.bind(message.channel);
        const reply = await originalReply('❌ Apenas **administradores** podem usar este comando!');
        setTimeout(() => reply.delete().catch(() => {}), 10000);
        return;
      }

      const { embed, components } = registro.createRegistrationPanel();
      
      // Verifica se há um canal configurado para o painel
      const painelCanalId = config.registro.painelCanalId;
      let targetChannel;

      if (painelCanalId) {
        // Usa o canal configurado no .env
        targetChannel = await message.client.channels.fetch(painelCanalId).catch(() => null);
        
        if (!targetChannel) {
          console.error(`❌ Canal de painel de registro não encontrado: ${painelCanalId}`);
          const originalReply = message.channel.send.bind(message.channel);
          const reply = await originalReply(`❌ Canal de painel configurado não encontrado! Verifique o ID no .env.`);
          setTimeout(() => reply.delete().catch(() => {}), 10000);
          return;
        }

        // Envia no canal configurado - MENSAGEM PERMANENTE (não apaga)
        await targetChannel.send({
          content: '📋 **Painel de Registro de Facção**\n\nClique no botão abaixo para iniciar seu registro!',
          embeds: [embed],
          components
        });

        console.log(`📋 Painel de registro enviado para canal: ${targetChannel.name || targetChannel.id}`);
        
        // Confirmação ao admin - auto-apaga após 10s
        const originalReply = message.channel.send.bind(message.channel);
        const reply = await originalReply(`✅ Painel de registro enviado com sucesso para o canal <#${painelCanalId}>!`);
        setTimeout(() => reply.delete().catch(() => {}), 10000);
      } else {
        // Se não configurado, envia no canal atual - MENSAGEM PERMANENTE (não apaga)
        await message.channel.send({
          content: '📋 **Painel de Registro de Facção**\n\nClique no botão abaixo para iniciar seu registro!',
          embeds: [embed],
          components
        });
      }
      
      break;
    }
    
    // Comando: !verificar-painel (apenas admin)
    case 'verificar-painel': {
      if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        const originalReply = message.channel.send.bind(message.channel);
        const reply = await originalReply('❌ Apenas **administradores** podem usar este comando!');
        setTimeout(() => reply.delete().catch(() => {}), 10000);
        return;
      }
    
      const { embed, components } = verificacao.createVerificationPanel();
            
      await message.channel.send({
        content: '🔐 **Painel de Verificação**\n\nClique no botão abaixo para se verificar!',
        embeds: [embed],
        components
      });
    
      console.log(`🔐 Painel de verificação enviado no canal: ${message.channel.name}`);
            
      const originalReply = message.channel.send.bind(message.channel);
      const reply = await originalReply('✅ Painel de verificação criado com sucesso!');
      setTimeout(() => reply.delete().catch(() => {}), 10000);
            
      break;
    }
    
    // Comando: !ticket-painel (apenas admin)
    case 'ticket-painel': {
      if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        const originalReply = message.channel.send.bind(message.channel);
        const reply = await originalReply('❌ Apenas **administradores** podem usar este comando!');
        setTimeout(() => reply.delete().catch(() => {}), 10000);
        return;
      }
    
      const { embed, components } = tickets.createTicketPanel();
            
      await message.channel.send({
        content: '📋 **Central de Tickets**\n\nSelecione uma categoria abaixo para abrir seu ticket!',
        embeds: [embed],
        components
      });
    
      console.log(`📋 Painel de tickets enviado no canal: ${message.channel.name}`);
            
      const originalReply = message.channel.send.bind(message.channel);
      const reply = await originalReply('✅ Painel de tickets criado com sucesso!');
      setTimeout(() => reply.delete().catch(() => {}), 10000);
            
      break;
    }
    
    // Comando: !transfer @usuario (apenas equipe)
    case 'transfer': {
      // Apagar mensagem do usuário após 3s
      setTimeout(() => message.delete().catch(() => {}), 3000);
      
      // Verificar se está em canal de ticket
      if (!message.channel.name.startsWith('ticket-')) {
        const originalReply = message.channel.send.bind(message.channel);
        const reply = await originalReply('❌ **Este comando só funciona em canais de ticket!**');
        setTimeout(() => reply.delete().catch(() => {}), 3000);
        return;
      }
    
      // Verificar se mencionou alguém
      const targetUser = message.mentions.users.first();
      if (!targetUser) {
        const originalReply = message.channel.send.bind(message.channel);
        const reply = await originalReply('❌ **Uso:** `!transfer @usuario`\n\nMencione o membro da equipe para transferir o ticket.');
        setTimeout(() => reply.delete().catch(() => {}), 3000);
        return;
      }
    
      // Verificar se é membro da equipe ou dono do ticket
      const cargoEquipeId = config.tickets.cargoEquipeId;
      const isEquipe = cargoEquipeId && message.member.roles.cache.has(cargoEquipeId);
      const isAdmin = message.member.permissions.has(PermissionsBitField.Flags.ManageChannels);
      
      if (!isEquipe && !isAdmin) {
        const originalReply = message.channel.send.bind(message.channel);
        const reply = await originalReply('❌ **Apenas membros da equipe podem transferir tickets!**');
        setTimeout(() => reply.delete().catch(() => {}), 3000);
        return;
      }
    
      await ticketsTransferencia.transferTicket(message, targetUser);
      break;
    }
    
    // Comando: !equipe (listar membros da equipe)
    case 'equipe': {
      setTimeout(() => message.delete().catch(() => {}), 3000);
      await ticketsTransferencia.listEquipe(message);
      break;
    }
    
    // Comando: !prioridade (definir prioridade do ticket)
    case 'prioridade': {
      await ticketsPrioridade.showPriorityMenu(message);
      break;
    }

    default:
      break;
  }
});

// ──────────────────────────────────────────
// INTERAÇÕES (BOTÕES E MODAIS)
// ──────────────────────────────────────────

client.on('interactionCreate', async (interaction) => {
  try {
    // Handle buttons
    if (interaction.isButton()) {
      // Botão de verificação
      if (interaction.customId === 'btn_verificar') {
        await verificacao.handleVerification(interaction);
        return;
      }

      // Botão de registrar - abre menu de recrutadores
      if (interaction.customId === 'btn_registrar') {
        const selectMenu = await registro.createRecruiterSelectMenu(interaction);
        
        if (!selectMenu) {
          await interaction.reply({
            content: '❌ Erro ao carregar lista de recrutadores. Tente novamente.',
            flags: [64]
          });
          return;
        }

        await interaction.reply({
          content: '🤝 **Selecione quem te recrutou:**',
          components: [selectMenu],
          flags: [64]
        });
        return;
      }

      // Botões de ticket (fechar)
      if (interaction.customId.startsWith('close_ticket_')) {
        const ticketId = interaction.customId.replace('close_ticket_', '');
        await tickets.handleTicketClose(interaction, ticketId);
        return;
      }

      // Confirmação de fechamento de ticket
      if (interaction.customId.startsWith('confirm_close_')) {
        const ticketId = interaction.customId.replace('confirm_close_', '');
        await tickets.handleTicketCloseConfirm(interaction, ticketId);
        return;
      }

      // Cancelar fechamento de ticket
      if (interaction.customId === 'cancel_close') {
        await interaction.update({
          content: '❌ **Fechamento cancelado.**',
          components: []
        });
        return;
      }

      // Botão de aprovar
      if (interaction.customId.startsWith('aprovar_')) {
        const registrationId = interaction.customId.replace('aprovar_', '');
        await registro.handleApprove(interaction, registrationId);
        return;
      }

      // Botão de recusar
      if (interaction.customId.startsWith('recusar_')) {
        const registrationId = interaction.customId.replace('recusar_', '');
        await registro.handleReject(interaction, registrationId);
        return;
      }
    }

    // Handle select menus
    if (interaction.isStringSelectMenu()) {
      // Menu de recrutador (registro)
      if (interaction.customId === 'select_recruiter') {
        const selectedUserId = interaction.values[0];
        const selectedUser = await interaction.client.users.fetch(selectedUserId);
        
        // Deletar a mensagem de seleção (com verificação)
        try {
          if (interaction.message && interaction.message.deletable) {
            await interaction.message.delete();
          }
        } catch (err) {
          console.log('⚠️ Não foi possível deletar mensagem de seleção:', err.message);
        }
        
        // Abrir modal com o recrutador selecionado
        const modal = registro.createRegistrationModal(selectedUserId, selectedUser.tag);
        await interaction.showModal(modal);
        return;
      }

      // Menu de categoria de ticket
      if (interaction.customId === 'select_ticket_category') {
        await tickets.handleCategorySelect(interaction);
        return;
      }

      // Menu de prioridade de ticket
      if (interaction.customId.startsWith('select_ticket_priority')) {
        const priority = interaction.values[0];
        const ticketChannelId = interaction.customId.split('_').slice(3).join('_');
        await ticketsPrioridade.setPriority(interaction, priority, ticketChannelId);
        return;
      }
    }

    // Handle modals
    if (interaction.isModalSubmit()) {
      if (interaction.customId === 'modal_registro') {
        await registro.handleModalSubmit(interaction);
        return;
      }
    }
  } catch (err) {
    // Ignora interações expiradas
    if (err.code === 10062) {
      console.log('⚠️ Interação expirou, ignorando...');
      return;
    }
    
    console.error('❌ Erro ao processar interação:', err);
    
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: '❌ Ocorreu um erro ao processar sua interação. Tente novamente.',
        flags: [64]
      }).catch(() => {});
    }
  }
});

// ──────────────────────────────────────────
// LOGS DO SERVIDOR
// ──────────────────────────────────────────

client.on('guildMemberAdd', (member) => {
  console.log(`🟢 Entrada: ${member.user.tag} (${member.guild.name})`);
  logs.logEntrada(client, member);
});

client.on('guildMemberRemove', (member) => {
  console.log(`🔴 Saída: ${member.user.tag} (${member.guild.name})`);
  logs.logSaida(client, member);
});

client.on('guildBanAdd', (ban) => {
  console.log(`⛔ Banimento: ${ban.user.tag} (${ban.guild.name})`);
  logs.logBanimento(client, ban.guild, ban.user);
});

client.on('guildBanRemove', (ban) => {
  console.log(`🔓 Desbanimento: ${ban.user.tag} (${ban.guild.name})`);
  logs.logDesbanimento(client, ban.guild, ban.user);
});

// Verifica token antes de tentar conectar
if (!TOKEN) {
  console.error('❌ Token não encontrado. Verifique se DISCORD_TOKEN está definido no arquivo .env.');
  process.exit(1);
}

// Login do bot
client.login(TOKEN).catch((err) => {
  console.error('❌ Erro ao conectar o bot:', err.message);

  if (err.message.includes('disallowed intents') || err.message.includes('Privileged intent')) {
    console.error('Verifique no Discord Developer Portal se os intents de Message Content e Guild Members estão habilitados.');
  }

  if (err.message.toLowerCase().includes('token')) {
    console.error('Verifique se o token DISCORD_TOKEN no arquivo .env está correto.');
  }
});
