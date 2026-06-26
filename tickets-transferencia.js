const { 
  EmbedBuilder,
  PermissionsBitField
} = require('discord.js');
const config = require('./config');

// Transferir ticket para outro membro da equipe
async function transferTicket(messageOrInteraction, targetUser) {
  try {
    // Determinar se é message ou interaction
    const isInteraction = messageOrInteraction.reply && messageOrInteraction.deferred !== undefined;
    const message = isInteraction ? messageOrInteraction : null;
    const interaction = isInteraction ? messageOrInteraction : null;
    const channel = messageOrInteraction.channel;
    const guild = messageOrInteraction.guild;
    const client = messageOrInteraction.client;
    const currentOwner = messageOrInteraction.user || messageOrInteraction.author;
    
    const ticketChannel = channel;
    
    // Verificar se é canal de ticket
    if (!ticketChannel.name.startsWith('ticket-')) {
      if (isInteraction) {
        await interaction.reply({
          content: '❌ **Este comando só funciona em canais de ticket!**',
          flags: [64]
        });
      }
      return;
    }

    // Verificar se target é membro da equipe
    const cargoEquipeId = config.tickets.cargoEquipeId;
    if (!cargoEquipeId) {
      if (isInteraction) {
        await interaction.reply({
          content: '❌ **Cargo de equipe não configurado! Contate um administrador.**',
          flags: [64]
        });
      }
      return;
    }

    const targetMember = await guild.members.fetch(targetUser.id).catch(() => null);
    if (!targetMember) {
      if (isInteraction) {
        await interaction.reply({
          content: '❌ **Usuário não encontrado no servidor!**',
          flags: [64]
        });
      }
      return;
    }

    // Verificar se target tem cargo de equipe
    if (!targetMember.roles.cache.has(cargoEquipeId)) {
      if (isInteraction) {
        await interaction.reply({
          content: `❌ **${targetUser} não é membro da equipe!**\n\nApenas membros com cargo de equipe podem receber tickets.`,
          flags: [64]
        });
      }
      return;
    }

    // Não pode transferir para si mesmo
    if (targetUser.id === currentOwner.id) {
      if (isInteraction) {
        await interaction.reply({
          content: '❌ **Você não pode transferir um ticket para si mesmo!**',
          flags: [64]
        });
      }
      return;
    }

    // Atualizar permissões do canal
    try {
      // Adicionar permissão ao novo responsável
      await ticketChannel.permissionOverwrites.create(targetMember, {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true,
        AttachFiles: true,
        EmbedLinks: true,
        ManageChannels: true
      });

      console.log(`✅ Permissões adicionadas para ${targetUser.tag} no ticket ${ticketChannel.name}`);
    } catch (err) {
      console.error(`❌ Erro ao atualizar permissões: ${err.message}`);
      await interaction.reply({
        content: '❌ **Erro ao atualizar permissões do canal!**',
        flags: [64]
      });
      return;
    }

    // Criar embed de transferência
    const transferEmbed = new EmbedBuilder()
      .setTitle('🔄 Ticket Transferido')
      .setColor(0xFFAA00)
      .setDescription(
        `**Este ticket foi transferido!**\n\n` +
        `👤 **Transferido por:** ${currentOwner}\n` +
        `🎯 **Novo responsável:** ${targetUser}\n` +
        `📅 **Data:** ${new Date().toLocaleString('pt-BR')}`
      )
      .setFooter({ text: `Transferido por ${currentOwner.tag}` })
      .setTimestamp();

    // Enviar notificação no canal
    await ticketChannel.send({
      content: `${targetUser}`,
      embeds: [transferEmbed]
    });

    // Enviar DM ao novo responsável
    try {
      const dmEmbed = new EmbedBuilder()
        .setTitle('🎯 Ticket Transferido para Você')
        .setColor(0xFFAA00)
        .setDescription(
          `**Você recebeu um novo ticket!**\n\n` +
          `📋 **Canal:** ${ticketChannel}\n` +
          `👤 **Transferido por:** ${currentOwner}\n` +
          `🔗 **Link:** https://discord.com/channels/${interaction.guild.id}/${ticketChannel.id}\n\n` +
          `Clique no link acima para acessar o ticket.`
        )
        .setFooter({ text: 'Sistema de Tickets' })
        .setTimestamp();

      await targetUser.send({ embeds: [dmEmbed] });
      console.log(`📧 DM enviada para ${targetUser.tag} sobre transferência`);
    } catch (err) {
      console.log(`⚠️ Não foi possível enviar DM para ${targetUser.tag}: ${err.message}`);
      // Não falha se DM não enviar
    }

    // Enviar log no canal de logs
    try {
      const logChannelId = config.tickets.logChannelId;
      if (logChannelId) {
        const logChannel = await client.channels.fetch(logChannelId).catch(() => null);
        
        if (logChannel) {
          const logEmbed = new EmbedBuilder()
            .setTitle('🔄 Ticket Transferido')
            .setColor(0xFFAA00)
            .setDescription(`Um ticket foi transferido para outro membro da equipe!`)
            .addFields(
              { name: '📋 Canal', value: `${ticketChannel} (${ticketChannel.name})`, inline: false },
              { name: '👤 Transferido por', value: `${currentOwner} (${currentOwner.tag})`, inline: true },
              { name: '🎯 Novo responsável', value: `${targetUser} (${targetUser.tag})`, inline: true },
              { name: '📅 Data', value: new Date().toLocaleString('pt-BR'), inline: false }
            )
            .setFooter({ text: `Transferência por ${currentOwner.tag}` })
            .setTimestamp();

          await logChannel.send({ embeds: [logEmbed] });
        }
      }
    } catch (err) {
      console.error(`❌ Erro ao enviar log: ${err.message}`);
    }

    // Confirmar transferência
    if (isInteraction) {
      const reply = await interaction.reply({
        content: `✅ **Ticket transferido com sucesso!**\n\n` +
                 `Novo responsável: ${targetUser}\n` +
                 `Uma notificação foi enviada.`,
        flags: [64]
      });
      setTimeout(() => reply.delete().catch(() => {}), 3000);
    } else {
      const reply = await channel.send(`✅ **Ticket transferido com sucesso!**\n\nNovo responsável: ${targetUser}`);
      setTimeout(() => reply.delete().catch(() => {}), 3000);
    }

    console.log(`🔄 Ticket ${ticketChannel.name} transferido de ${currentOwner.tag} para ${targetUser.tag}`);

  } catch (err) {
    console.error('❌ Erro ao transferir ticket:', err);
    
    if (err.code === 10062) {
      console.log('⚠️ Interação de transferência expirou');
      return;
    }

    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: '❌ Ocorreu um erro ao transferir o ticket.',
        flags: [64]
      }).catch(() => {});
    }
  }
}

// Listar todos os membros da equipe
async function listEquipe(messageOrInteraction) {
  try {
    const isInteraction = messageOrInteraction.reply && messageOrInteraction.deferred !== undefined;
    const interaction = isInteraction ? messageOrInteraction : null;
    const guild = messageOrInteraction.guild;
    const channel = messageOrInteraction.channel;
    const user = messageOrInteraction.user || messageOrInteraction.author;
    const cargoEquipeId = config.tickets.cargoEquipeId;
    
    if (!cargoEquipeId) {
      if (isInteraction) {
        await interaction.reply({
          content: '❌ **Cargo de equipe não configurado!**',
          flags: [64]
        });
      }
      return;
    }

    const cargo = await guild.roles.fetch(cargoEquipeId);
    if (!cargo) {
      if (isInteraction) {
        await interaction.reply({
          content: '❌ **Cargo de equipe não encontrado!**',
          flags: [64]
        });
      }
      return;
    }

    const members = cargo.members;
    
    if (members.size === 0) {
      if (isInteraction) {
        await interaction.reply({
          content: `⚠️ **Nenhum membro no cargo ${cargo.name}!**`,
          flags: [64]
        });
      }
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle('👥 Membros da Equipe de Tickets')
      .setColor(cargo.color || 0x0099FF)
      .setDescription(
        `Cargo: **${cargo.name}** | <@&${cargo.id}>\n` +
        `Total: **${members.size}** membro(s)\n\n` +
        `Use **!transfer @usuario** dentro de um ticket para transferir atendimento.`
      )
      .setTimestamp();

    const sortedMembers = members.sort((a, b) => a.user.tag.localeCompare(b.user.tag, 'pt-BR', { sensitivity: 'base' }));
    const memberEntries = sortedMembers.map((member, index) =>
      `${index + 1}. ${member.user} — \`${member.user.tag}\``
    );

    const maxVisible = 20;
    const visibleList = memberEntries.slice(0, maxVisible).join('\n');
    const moreCount = members.size - maxVisible;

    embed.addFields({
      name: 'Membros',
      value: visibleList + (moreCount > 0 ? `\n...e mais ${moreCount} membro(s)` : ''),
      inline: false
    });

    const notes = [];
    notes.push('👤 Membros listados em ordem alfabética de ID.');
    notes.push('📌 Caso queira transferir um ticket, mencione o membro.');

    embed.addFields({
      name: 'Informações',
      value: notes.join('\n'),
      inline: false
    });

    if (isInteraction) {
      await interaction.reply({
        embeds: [embed],
        flags: [64]
      });
    } else {
      const reply = await channel.send({ embeds: [embed] });
      setTimeout(() => reply.delete().catch(() => {}), 3000);
    }

    console.log(`👥 Lista de equipe solicitada por ${user.tag}`);

  } catch (err) {
    console.error('❌ Erro ao listar equipe:', err);
    
    const isInteraction = messageOrInteraction.reply && messageOrInteraction.deferred !== undefined;
    
    if (!isInteraction) {
      const reply = await messageOrInteraction.channel.send('❌ Ocorreu um erro ao listar a equipe.');
      setTimeout(() => reply.delete().catch(() => {}), 10000);
    } else if (!messageOrInteraction.replied && !messageOrInteraction.deferred) {
      await messageOrInteraction.reply({
        content: '❌ Ocorreu um erro ao listar a equipe.',
        flags: [64]
      }).catch(() => {});
    }
  }
}

module.exports = {
  transferTicket,
  listEquipe
};
