const { 
  EmbedBuilder,
  PermissionsBitField,
  ActionRowBuilder,
  StringSelectMenuBuilder
} = require('discord.js');
const config = require('./config');

// Definição de prioridades
const PRIORIDADES = {
  urgente: {
    emoji: '🔴',
    label: 'URGENTE',
    color: 0xFF0000,
    description: 'Problema crítico que precisa de atenção imediata',
    notifyEquipe: true
  },
  alta: {
    emoji: '🟠',
    label: 'ALTA',
    color: 0xFF8800,
    description: 'Problema importante que deve ser resolvido logo',
    notifyEquipe: true
  },
  media: {
    emoji: '🟡',
    label: 'MÉDIA',
    color: 0xFFDD00,
    description: 'Problema normal sem urgência extrema',
    notifyEquipe: false
  },
  baixa: {
    emoji: '🔵',
    label: 'BAIXA',
    color: 0x0088FF,
    description: 'Sugestão ou dúvida sem pressa',
    notifyEquipe: false
  }
};

// Menu de seleção de prioridade
function createPrioritySelectMenu(ticketChannelId) {
  const selectMenu = new ActionRowBuilder()
    .addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`select_ticket_priority_${ticketChannelId}`)
        .setPlaceholder('Selecione a prioridade do ticket...')
        .addOptions([
          {
            label: '🔴 URGENTE',
            description: 'Problema crítico - atenção imediata',
            value: 'urgente',
            emoji: '🔴'
          },
          {
            label: '🟠 ALTA',
            description: 'Problema importante - resolver logo',
            value: 'alta',
            emoji: '🟠'
          },
          {
            label: '🟡 MÉDIA',
            description: 'Problema normal sem urgência',
            value: 'media',
            emoji: '🟡'
          },
          {
            label: '🔵 BAIXA',
            description: 'Sugestão ou dúvida sem pressa',
            value: 'baixa',
            emoji: '🔵'
          }
        ])
    );

  return selectMenu;
}

// Definir prioridade de um ticket
async function setPriority(interaction, priority, ticketChannelId = null) {
  try {
    const user = interaction.user;
    const ticketChannel = ticketChannelId
      ? await interaction.client.channels.fetch(ticketChannelId).catch(() => null)
      : interaction.channel;

    if (!ticketChannel || !ticketChannel.name || !ticketChannel.name.startsWith('ticket-')) {
      await interaction.reply({
        content: '❌ **Este comando só funciona em canais de ticket!**',
        flags: [64]
      });
      return;
    }

    const guild = ticketChannel.guild;
    let member = interaction.member;
    if (!member && guild) {
      member = await guild.members.fetch(user.id).catch(() => null);
    }

    // Verificar se é membro da equipe
    const cargoEquipeId = config.tickets.cargoEquipeId;
    const isEquipe = cargoEquipeId && member && member.roles.cache.has(cargoEquipeId);
    
    if (!isEquipe) {
      console.log(`⚠️ Usuário ${interaction.user.tag} tentou definir prioridade sem o cargo da equipe`);
      await interaction.reply({
        content: '❌ **Apenas membros da equipe podem definir prioridade!**',
        flags: [64]
      });
      return;
    }

    const prioridadeInfo = PRIORIDADES[priority];
    if (!prioridadeInfo) {
      await interaction.reply({
        content: '❌ **Prioridade inválida!**',
        flags: [64]
      });
      return;
    }

    // Atualizar nome do canal com prioridade
    const currentName = ticketChannel.name;
    // Remover prioridade antiga se existir
    const nameWithoutPriority = currentName.replace(/^(urgente|alta|media|baixa)-/, '');
    const newName = `${priority}-${nameWithoutPriority}`;
    
    try {
      await ticketChannel.setName(newName);
      console.log(`📝 Canal renomeado para: ${newName}`);
    } catch (err) {
      console.log(`⚠️ Não foi possível renomear o canal: ${err.message}`);
    }

    // Criar embed de prioridade definida para o autor do comando
    const priorityEmbed = new EmbedBuilder()
      .setTitle(`${prioridadeInfo.emoji} Prioridade Definida`)
      .setColor(prioridadeInfo.color)
      .setDescription(
        `**Prioridade do ticket atualizada!**\n\n` +
        `🎯 **Nível:** ${prioridadeInfo.emoji} ${prioridadeInfo.label}\n` +
        `📝 **Descrição:** ${prioridadeInfo.description}\n` +
        `👤 **Definido por:** ${user}\n` +
        `📅 **Data:** ${new Date().toLocaleString('pt-BR')}`
      )
      .setFooter({ text: `Prioridade definida por ${user.tag}` })
      .setTimestamp();

    // Se for urgente ou alta, notificar equipe NO CANAL (visível apenas para equipe)
    if (prioridadeInfo.notifyEquipe && cargoEquipeId) {
      // Não enviar notificações de prioridade diretamente no canal do ticket.
      // Assim, outros usuários do ticket não veem a mensagem de prioridade.
    }

    // Não publicar mensagem de prioridade no canal do ticket.

    // Log no canal de logs
    try {
      const logChannelId = config.tickets.logChannelId;
      if (logChannelId) {
        const logChannel = await interaction.client.channels.fetch(logChannelId).catch(() => null);
        
        if (logChannel) {
          const logEmbed = new EmbedBuilder()
            .setTitle('🎯 Prioridade Definida')
            .setColor(prioridadeInfo.color)
            .setDescription(`A prioridade de um ticket foi definida!`)
            .addFields(
              { name: '📋 Canal', value: `${ticketChannel} (${newName})`, inline: false },
              { name: '🎯 Prioridade', value: `${prioridadeInfo.emoji} ${prioridadeInfo.label}`, inline: true },
              { name: '👤 Definido por', value: `${user} (${user.tag})`, inline: true },
              { name: '📅 Data', value: new Date().toLocaleString('pt-BR'), inline: false }
            )
            .setFooter({ text: `Prioridade por ${user.tag}` })
            .setTimestamp();

          await logChannel.send({ embeds: [logEmbed] });
        }
      }
    } catch (err) {
      console.error(`❌ Erro ao enviar log: ${err.message}`);
    }

    // Confirmar para quem definiu
    await interaction.reply({
      content: `✅ **Prioridade definida!**\n\n` +
               `Nível: ${prioridadeInfo.emoji} ${prioridadeInfo.label}\n` +
               `Canal renomeado para: \`${newName}\`\n` +
               `Esta confirmação é visível apenas para você.`,
      embeds: [priorityEmbed],
      flags: [64]
    });

    console.log(`🎯 Prioridade ${prioridadeInfo.label} definida para ${ticketChannel.name} por ${user.tag}`);

  } catch (err) {
    console.error('❌ Erro ao definir prioridade:', err);
    
    if (err.code === 10062) {
      console.log('⚠️ Interação de prioridade expirou');
      return;
    }

    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: '❌ Ocorreu um erro ao definir a prioridade.',
        flags: [64]
      }).catch(() => {});
    }
  }
}

// Comando !prioridade com menu
async function showPriorityMenu(message) {
  try {
    const channel = message.channel;
    
    // Verificar se está em canal de ticket
    if (!channel.name.startsWith('ticket-')) {
      const reply = await message.reply({
        content: '❌ **Este comando só funciona em canais de ticket!**',
        flags: [64]
      });
      setTimeout(() => reply.delete().catch(() => {}), 10000);
      return;
    }

    // Verificar se é membro da equipe
    const cargoEquipeId = config.tickets.cargoEquipeId;
    const isEquipe = cargoEquipeId && message.member.roles.cache.has(cargoEquipeId);
    
    // Se não tem permissão, apenas retorna e mostra erro para quem tentou usar
    if (!isEquipe) {
      console.log(`⚠️ Usuário ${message.author.tag} tentou usar !prioridade sem permissão`);
      const reply = await message.reply({
        content: '❌ **Apenas membros da equipe podem usar este comando!**'
      });
      setTimeout(() => reply.delete().catch(() => {}), 10000);
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle('🎯 Definir Prioridade do Ticket')
      .setColor(0x9B59B6)
      .setDescription(
        '**Selecione a prioridade deste ticket:**\n\n' +
        '🔴 **URGENTE** - Problema crítico que precisa de atenção imediata\n' +
        '🟠 **ALTA** - Problema importante que deve ser resolvido logo\n' +
        '🟡 **MÉDIA** - Problema normal sem urgência extrema\n' +
        '🔵 **BAIXA** - Sugestão ou dúvida sem pressa'
      )
      .setFooter({ text: 'Apenas membros da equipe podem definir prioridade' })
      .setTimestamp();

    const selectMenu = createPrioritySelectMenu(channel.id);

    try {
      const dmChannel = await message.author.createDM();
      await dmChannel.send({ embeds: [embed], components: [selectMenu] });
      await message.delete().catch(() => {});
      console.log(`🎯 Menu de prioridade enviado por DM para ${message.author.tag}`);
      return;
    } catch (dmError) {
      console.log(`⚠️ Não foi possível enviar DM para ${message.author.tag}, exibindo menu no canal: ${dmError.message}`);
    }

    const reply = await message.reply({
      embeds: [embed],
      components: [selectMenu]
    });

    // Apagar após 30 segundos para reduzir o tempo que outros usuários veem o menu
    setTimeout(() => reply.delete().catch(() => {}), 30000);

    console.log(`🎯 Menu de prioridade exibido por ${message.author.tag}`);

  } catch (err) {
    console.error('❌ Erro ao mostrar menu de prioridade:', err);
  }
}

// Obter informações de prioridades
function getPriorityInfo() {
  return PRIORIDADES;
}

module.exports = {
  PRIORIDADES,
  createPrioritySelectMenu,
  setPriority,
  showPriorityMenu,
  getPriorityInfo
};
