const { 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle,
  StringSelectMenuBuilder,
  EmbedBuilder,
  PermissionsBitField,
  ChannelType,
  ComponentType
} = require('discord.js');
const config = require('./config');

// Mapa para rastrear tickets ativos
const activeTickets = new Map();

// Categorias de tickets
const TICKET_CATEGORIES = {
  suporte: {
    emoji: '🎧',
    label: 'Suporte',
    description: 'Precisa de ajuda? Abra um ticket de suporte',
    color: 0x0099FF
  },
  denuncia: {
    emoji: '⚠️',
    label: 'Denúncia',
    description: 'Denuncie um usuário ou comportamento inadequado',
    color: 0xFF0000
  },
  sugestao: {
    emoji: '💡',
    label: 'Sugestão',
    description: 'Tem uma ideia para melhorar o servidor?',
    color: 0x00FF00
  },
  outro: {
    emoji: '📝',
    label: 'Outro',
    description: 'Outros assuntos não categorizados',
    color: 0xFFAA00
  }
};

// Criar embed e botão de tickets
function createTicketPanel() {
  const embed = new EmbedBuilder()
    .setTitle('📋 Central de Tickets')
    .setColor(0x9B59B6)
    .setDescription(
      '**Bem-vindo à Central de Tickets!**\n\n' +
      'Selecione uma categoria abaixo para abrir seu ticket.\n\n' +
      '📌 **Regras:**\n' +
      '• Seja claro e objetivo\n' +
      '• Aguarde a resposta da equipe\n' +
      '• Não abuse do sistema\n' +
      '• Um ticket por assunto'
    )
    .addFields(
      { 
        name: '🎧 Suporte', 
        value: 'Precisa de ajuda com algo? Nossa equipe está pronta para ajudar!', 
        inline: false 
      },
      { 
        name: '⚠️ Denúncia', 
        value: 'Reporte comportamento inadequado ou violações das regras.', 
        inline: false 
      },
      { 
        name: '💡 Sugestão', 
        value: 'Tem ideias para melhorar o servidor? Compartilhe conosco!', 
        inline: false 
      },
      { 
        name: '📝 Outro', 
        value: 'Assuntos que não se encaixam nas outras categorias.', 
        inline: false 
      }
    )
    .setFooter({ text: 'Selecione uma categoria para abrir seu ticket' })
    .setTimestamp();

  const selectMenu = new ActionRowBuilder()
    .addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('select_ticket_category')
        .setPlaceholder('Selecione uma categoria...')
        .addOptions([
          {
            label: 'Suporte',
            description: 'Precisa de ajuda? Abra um ticket de suporte',
            value: 'suporte',
            emoji: '🎧'
          },
          {
            label: 'Denúncia',
            description: 'Denuncie um usuário ou comportamento',
            value: 'denuncia',
            emoji: '⚠️'
          },
          {
            label: 'Sugestão',
            description: 'Sugestões para melhorar o servidor',
            value: 'sugestao',
            emoji: '💡'
          },
          {
            label: 'Outro',
            description: 'Outros assuntos',
            value: 'outro',
            emoji: '📝'
          }
        ])
    );

  return { embed, components: [selectMenu] };
}

// Processar seleção de categoria
async function handleCategorySelect(interaction) {
  try {
    const category = interaction.values[0];
    const userId = interaction.user.id;
    const userName = interaction.user.tag;

    // Verificar se já tem ticket aberto
    const userTicket = activeTickets.get(userId);
    if (userTicket && !userTicket.closed) {
      await interaction.reply({
        content: `⚠️ **Você já tem um ticket aberto!**\n\n` +
                 `Categoria: ${TICKET_CATEGORIES[userTicket.category].emoji} ${TICKET_CATEGORIES[userTicket.category].label}\n` +
                 `Canal: <#${userTicket.channelId}>\n\n` +
                 `Por favor, use seu ticket atual ou feche-o antes de abrir um novo.`,
        flags: [64]
      });
      return;
    }

    const categoryInfo = TICKET_CATEGORIES[category];
    
    // Criar canal do ticket com permissões para equipe
    const permissionOverwrites = [
      {
        id: interaction.guild.id,
        deny: [PermissionsBitField.Flags.ViewChannel]
      },
      {
        id: userId,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.ReadMessageHistory,
          PermissionsBitField.Flags.AttachFiles,
          PermissionsBitField.Flags.EmbedLinks
        ]
      },
      {
        id: interaction.client.user.id,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.ReadMessageHistory,
          PermissionsBitField.Flags.ManageChannels
        ]
      }
    ];

    // Adicionar permissão para cargo da equipe (se configurado)
    const cargoEquipeId = config.tickets.cargoEquipeId;
    if (cargoEquipeId) {
      permissionOverwrites.push({
        id: cargoEquipeId,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.ReadMessageHistory,
          PermissionsBitField.Flags.AttachFiles,
          PermissionsBitField.Flags.EmbedLinks,
          PermissionsBitField.Flags.ManageChannels
        ]
      });
      console.log(`👥 Cargo da equipe terá acesso ao ticket`);
    }

    // Criar canal do ticket
    const ticketChannel = await interaction.guild.channels.create({
      name: `ticket-${category}-${userName.toLowerCase().replace(/\s/g, '-')}`,
      type: ChannelType.GuildText,
      permissionOverwrites
    });

    // Salvar ticket
    const ticketId = Date.now().toString();
    activeTickets.set(userId, {
      ticketId,
      userId,
      userName,
      category,
      channelId: ticketChannel.id,
      createdAt: Date.now(),
      closed: false,
      messages: []
    });

    console.log(`📋 Ticket criado: ${categoryInfo.label} por ${userName} (${ticketChannel.id})`);

    // Enviar embed no canal do ticket
    const ticketEmbed = new EmbedBuilder()
      .setTitle(`${categoryInfo.emoji} Ticket de ${categoryInfo.label}`)
      .setColor(categoryInfo.color)
      .setDescription(
        `**Olá ${interaction.user}!**\n\n` +
        `Seu ticket de **${categoryInfo.label.toLowerCase()}** foi criado com sucesso!\n\n` +
        `**Categoria:** ${categoryInfo.emoji} ${categoryInfo.label}\n` +
        `**Descrição:** ${categoryInfo.description}\n\n` +
        `Aguarde enquanto nossa equipe responde seu ticket.\n` +
        `⚠️ **Apenas a equipe pode fechar este ticket.**`
      )
      .addFields(
        { name: '📅 Criado em', value: new Date().toLocaleString('pt-BR'), inline: true },
        { name: '🆔 ID do Ticket', value: ticketId, inline: true }
      )
      .setFooter({ text: `Ticket #${ticketId} | Apenas equipe pode fechar` })
      .setTimestamp();

    const closeButton = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`close_ticket_${ticketId}`)
          .setLabel('🔒 Fechar Ticket')
          .setStyle(ButtonStyle.Danger)
      );

    // Mensagem inicial com menção à equipe
    let contentMessage = `${interaction.user}`;
    if (cargoEquipeId) {
      contentMessage += ` | <@&${cargoEquipeId}>`;
    }

    // Nota: Botão de fechar está visível, mas só equipe pode usar
    await ticketChannel.send({
      content: contentMessage,
      embeds: [ticketEmbed],
      components: [closeButton]
    });

    // Notificar no canal de logs
    await sendTicketLog(interaction, {
      action: 'create',
      ticketId,
      userId,
      userName,
      category,
      categoryInfo,
      channelId: ticketChannel.id
    });

    await interaction.reply({
      content: `✅ **Ticket criado com sucesso!**\n\n` +
               `Categoria: ${categoryInfo.emoji} ${categoryInfo.label}\n` +
               `Canal: ${ticketChannel}\n\n` +
               `A equipe responderá em breve!`,
      flags: [64]
    });

  } catch (err) {
    // Ignora se a interação expirou - NÃO mostra erro
    if (err.code === 10062) {
      console.log('⚠️ Interação de ticket expirou (usuário demorou mais de 3 minutos)');
      return;
    }
    
    console.error('❌ Erro ao criar ticket:', err);

    // Só tenta responder se a interação ainda for válida
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({
        content: '❌ Ocorreu um erro ao criar o ticket. Tente novamente.',
        flags: [64]
      }).catch(() => {
        // Se falhar, a interação já expirou, ignora
      });
    } else {
      await interaction.reply({
        content: '❌ Ocorreu um erro ao criar o ticket. Tente novamente.',
        flags: [64]
      }).catch(() => {
        // Se falhar, a interação já expirou, ignora
      });
    }
  }
}

// Processar fechamento de ticket
async function handleTicketClose(interaction, ticketId) {
  try {
    const userId = interaction.user.id;
    const userName = interaction.user.tag;

    // Buscar ticket
    let ticketData = null;
    let ticketUserId = null;

    for (const [uid, data] of activeTickets.entries()) {
      if (data.ticketId === ticketId) {
        ticketData = data;
        ticketUserId = uid;
        break;
      }
    }

    if (!ticketData) {
      await interaction.reply({
        content: '❌ **Ticket não encontrado!**',
        flags: [64]
      });
      return;
    }

    // Verificar se é membro da equipe ou tem permissão
    const hasManagePermission = interaction.member.permissions.has(PermissionsBitField.Flags.ManageChannels);
    
    // Verificar se tem cargo da equipe
    let hasEquipeRole = false;
    const cargoEquipeId = config.tickets.cargoEquipeId;
    if (cargoEquipeId) {
      hasEquipeRole = interaction.member.roles.cache.has(cargoEquipeId);
    }
    
    // APENAS equipe pode fechar (usuário NÃO pode)
    if (!hasManagePermission && !hasEquipeRole) {
      await interaction.reply({
        content: '⚠️ **Apenas membros da equipe podem fechar tickets!**',
        flags: [64]
      });
      return;
    }

    // Gerar transcrição
    const transcript = await generateTranscript(interaction, ticketData);

    // Confirmar fechamento
    const confirmButton = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`confirm_close_${ticketId}`)
          .setLabel('✅ Confirmar')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('cancel_close')
          .setLabel('❌ Cancelar')
          .setStyle(ButtonStyle.Secondary)
      );

    await interaction.reply({
      content: `🔒 **Deseja realmente fechar este ticket?**\n\n` +
               `Uma transcrição será enviada no canal de logs.`,
      components: [confirmButton],
      flags: [64]
    });

  } catch (err) {
    // Ignora se a interação expirou
    if (err.code === 10062) {
      console.log('⚠️ Interação de fechamento de ticket expirou');
      return;
    }
    
    console.error('❌ Erro ao fechar ticket:', err);
    
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: '❌ Ocorreu um erro ao fechar o ticket.',
        flags: [64]
      }).catch(() => {});
    }
  }
}

// Confirmar fechamento de ticket
async function handleTicketCloseConfirm(interaction, ticketId) {
  try {
    // Buscar ticket
    let ticketData = null;
    let ticketUserId = null;

    for (const [uid, data] of activeTickets.entries()) {
      if (data.ticketId === ticketId) {
        ticketData = data;
        ticketUserId = uid;
        break;
      }
    }

    if (!ticketData) {
      await interaction.update({
        content: '❌ **Ticket não encontrado!**',
        components: []
      });
      return;
    }

    // Buscar canal do ticket
    const channel = await interaction.guild.channels.fetch(ticketData.channelId).catch(() => null);
    
    if (channel) {
      // Gerar transcrição final
      const transcript = await generateTranscript(interaction, ticketData);

      // Enviar transcrição para logs
      await sendTicketLog(interaction, {
        action: 'close',
        ticketId,
        userId: ticketData.userId,
        userName: ticketData.userName,
        category: ticketData.category,
        categoryInfo: TICKET_CATEGORIES[ticketData.category],
        channelId: ticketData.channelId,
        transcript,
        closedBy: interaction.user.tag,
        duration: Date.now() - ticketData.createdAt
      });

      // Mensagem de despedida
      const closeEmbed = new EmbedBuilder()
        .setTitle('🔒 Ticket Fechado')
        .setColor(0xFF0000)
        .setDescription(
          `**Este ticket foi fechado por ${interaction.user}**\n\n` +
          `📅 **Fechado em:** ${new Date().toLocaleString('pt-BR')}\n` +
          `⏱️ **Duração:** ${formatDuration(Date.now() - ticketData.createdAt)}\n\n` +
          `Uma transcrição foi enviada para o canal de logs.`
        )
        .setFooter({ text: `Ticket #${ticketId}` })
        .setTimestamp();

      await channel.send({ embeds: [closeEmbed] });

      // Deletar canal após 5 segundos
      setTimeout(async () => {
        try {
          await channel.delete();
          console.log(`🗑️ Canal do ticket deletado: ${channel.name}`);
        } catch (err) {
          console.error(`❌ Erro ao deletar canal do ticket: ${err.message}`);
        }
      }, 5000);
    }

    // Marcar como fechado
    activeTickets.set(ticketUserId, { ...ticketData, closed: true });

    // Remover do mapa após 1 hora
    setTimeout(() => {
      activeTickets.delete(ticketUserId);
    }, 3600000);

    await interaction.update({
      content: '✅ **Ticket fechado com sucesso!**\n\n' +
               'A transcrição foi enviada para o canal de logs.',
      components: []
    });

    console.log(`🔒 Ticket fechado: #${ticketId} por ${interaction.user.tag}`);

  } catch (err) {
    console.error('❌ Erro ao confirmar fechamento:', err);
  }
}

// Gerar transcrição do ticket
async function generateTranscript(interaction, ticketData) {
  try {
    const channel = await interaction.guild.channels.fetch(ticketData.channelId).catch(() => null);
    
    if (!channel) {
      return 'Transcrição indisponível (canal não encontrado)';
    }

    const messages = await channel.messages.fetch({ limit: 100 });
    const sortedMessages = messages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);

    let transcript = `═══════════════════════════════════════\n`;
    transcript += `TRANSCRIÇÃO DO TICKET #${ticketData.ticketId}\n`;
    transcript += `═══════════════════════════════════════\n\n`;
    transcript += `👤 Usuário: ${ticketData.userName}\n`;
    transcript += `📋 Categoria: ${TICKET_CATEGORIES[ticketData.category].label}\n`;
    transcript += `📅 Criado em: ${new Date(ticketData.createdAt).toLocaleString('pt-BR')}\n`;
    transcript += `🔒 Fechado em: ${new Date().toLocaleString('pt-BR')}\n`;
    transcript += `⏱️ Duração: ${formatDuration(Date.now() - ticketData.createdAt)}\n\n`;
    transcript += `═══════════════════════════════════════\n`;
    transcript += `MENSAGENS:\n`;
    transcript += `═══════════════════════════════════════\n\n`;

    sortedMessages.forEach(msg => {
      const timestamp = new Date(msg.createdTimestamp).toLocaleString('pt-BR');
      const author = msg.author.bot ? `🤖 ${msg.author.tag}` : `👤 ${msg.author.tag}`;
      const content = msg.content || (msg.attachments.size > 0 ? '[Arquivo anexado]' : '[Embed]');
      
      transcript += `[${timestamp}] ${author}:\n`;
      transcript += `${content}\n\n`;
    });

    transcript += `═══════════════════════════════════════\n`;
    transcript += `FIM DA TRANSCRIÇÃO\n`;
    transcript += `═══════════════════════════════════════`;

    return transcript;

  } catch (err) {
    console.error('❌ Erro ao gerar transcrição:', err);
    return 'Erro ao gerar transcrição';
  }
}

// Enviar log de ticket
async function sendTicketLog(interaction, data) {
  try {
    const logChannelId = config.tickets.logChannelId;
    
    if (!logChannelId) {
      // Não é erro - apenas informa que logs estão desativados
      if (data.action === 'create') {
        console.log('ℹ️ Logs de tickets desativados (configure TICKETS_LOG_CHANNEL_ID no .env)');
      }
      return;
    }

    const logChannel = await interaction.client.channels.fetch(logChannelId).catch(() => null);
    
    if (!logChannel) {
      console.log(`⚠️ Canal de logs de tickets não encontrado: ${logChannelId}`);
      return;
    }

    if (data.action === 'create') {
      const logEmbed = new EmbedBuilder()
        .setTitle('📋 Ticket Criado')
        .setColor(data.categoryInfo.color)
        .setDescription(`Um novo ticket foi aberto!`)
        .addFields(
          { name: '🆔 Ticket ID', value: data.ticketId, inline: true },
          { name: '👤 Usuário', value: `<@${data.userId}>`, inline: true },
          { name: '📋 Categoria', value: `${data.categoryInfo.emoji} ${data.categoryInfo.label}`, inline: true },
          { name: '📺 Canal', value: `<#${data.channelId}>`, inline: true },
          { name: '📅 Data', value: new Date().toLocaleString('pt-BR'), inline: false }
        )
        .setFooter({ text: `Ticket #${data.ticketId}` })
        .setTimestamp();

      await logChannel.send({ embeds: [logEmbed] });

    } else if (data.action === 'close') {
      const logEmbed = new EmbedBuilder()
        .setTitle('🔒 Ticket Fechado')
        .setColor(0xFF0000)
        .setDescription(`O ticket foi fechado!`)
        .addFields(
          { name: '🆔 Ticket ID', value: data.ticketId, inline: true },
          { name: '👤 Usuário', value: `<@${data.userId}>`, inline: true },
          { name: '📋 Categoria', value: `${data.categoryInfo.emoji} ${data.categoryInfo.label}`, inline: true },
          { name: '🔒 Fechado por', value: data.closedBy, inline: true },
          { name: '⏱️ Duração', value: formatDuration(data.duration), inline: true },
          { name: '📅 Criado em', value: new Date(Date.now() - data.duration).toLocaleString('pt-BR'), inline: true }
        )
        .setFooter({ text: `Ticket #${data.ticketId}` })
        .setTimestamp();

      await logChannel.send({ embeds: [logEmbed] });

      // Enviar transcrição como arquivo
      if (data.transcript) {
        const fs = require('fs');
        const path = require('path');
        const transcriptPath = path.join(__dirname, `transcript-${data.ticketId}.txt`);
        
        fs.writeFileSync(transcriptPath, data.transcript, 'utf8');
        
        await logChannel.send({
          content: `📄 **Transcrição do Ticket #${data.ticketId}**`,
          files: [transcriptPath]
        });

        // Deletar arquivo após envio
        setTimeout(() => {
          fs.unlink(transcriptPath, () => {});
        }, 5000);
      }
    }

  } catch (err) {
    console.error('❌ Erro ao enviar log de ticket:', err);
  }
}

// Formatar duração
function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
  if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

// Obter estatísticas
function getTicketStats() {
  let open = 0;
  let closed = 0;

  activeTickets.forEach(ticket => {
    if (ticket.closed) closed++;
    else open++;
  });

  return {
    total: activeTickets.size,
    abertos: open,
    fechados: closed
  };
}

module.exports = {
  createTicketPanel,
  handleCategorySelect,
  handleTicketClose,
  handleTicketCloseConfirm,
  getTicketStats
};
