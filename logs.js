const { EmbedBuilder } = require('discord.js');
const config = require('./config');

function formatDate(date = new Date()) {
  return date.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

function shouldLog(guild) {
  const configServerId = config.logServerId;
  // Se nenhum servidor for configurado, loga todos
  if (!configServerId) return true;
  // Senão, loga apenas se for o servidor configurado
  return guild.id === configServerId;
}

async function sendLog(client, type, embed) {
  const channelId = config.logChannelIds[type] || config.logChannelIds.geral;
  if (!channelId) {
    console.warn(`⚠️ Canal de log não configurado para: ${type}`);
    return;
  }

  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel || !channel.send) {
      console.warn(`⚠️ Canal de log não encontrado ou inválido: ${channelId}`);
      return;
    }
    await channel.send({ embeds: [embed] });
  } catch (err) {
    console.error(`❌ Erro ao enviar log (${type}):`, err.message);
  }
}

function logEntrada(client, member) {
  if (!shouldLog(member.guild)) return;

  const embed = new EmbedBuilder()
    .setColor('#00FF00')
    .setTitle('🟢 Entrada no servidor')
    .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 256 }))
    .addFields(
      { name: 'Usuário', value: `${member.user.tag} (${member.user.id})`, inline: false },
      { name: 'Menção', value: `<@${member.user.id}>`, inline: true },
      { name: 'Conta criada em', value: formatDate(member.user.createdAt), inline: true },
      { name: 'Total de membros', value: `${member.guild.memberCount}`, inline: true }
    )
    .setFooter({ text: `ID do servidor: ${member.guild.id}` })
    .setTimestamp();

  sendLog(client, 'entradas', embed);
}

function logSaida(client, member) {
  if (!shouldLog(member.guild)) return;

  const embed = new EmbedBuilder()
    .setColor('#FF0000')
    .setTitle('🔴 Saída do servidor')
    .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 256 }))
    .addFields(
      { name: 'Usuário', value: `${member.user.tag} (${member.user.id})`, inline: false },
      { name: 'Menção', value: `<@${member.user.id}>`, inline: true },
      { name: 'Conta criada em', value: formatDate(member.user.createdAt), inline: true },
      { name: 'Total de membros', value: `${member.guild.memberCount}`, inline: true }
    )
    .setFooter({ text: `ID do servidor: ${member.guild.id}` })
    .setTimestamp();

  sendLog(client, 'saidas', embed);
}

function logBanimento(client, guild, user) {
  if (!shouldLog(guild)) return;

  const embed = new EmbedBuilder()
    .setColor('#8B0000')
    .setTitle('⛔ Usuário banido')
    .setThumbnail(user.displayAvatarURL({ dynamic: true, size: 256 }))
    .addFields(
      { name: 'Usuário', value: `${user.tag} (${user.id})`, inline: false },
      { name: 'Menção', value: `<@${user.id}>`, inline: true },
      { name: 'Servidor', value: guild.name, inline: true }
    )
    .setFooter({ text: `ID do servidor: ${guild.id}` })
    .setTimestamp();

  sendLog(client, 'banimentos', embed);
}

function logDesbanimento(client, guild, user) {
  if (!shouldLog(guild)) return;

  const embed = new EmbedBuilder()
    .setColor('#FFA500')
    .setTitle('🔓 Usuário desbanido')
    .setThumbnail(user.displayAvatarURL({ dynamic: true, size: 256 }))
    .addFields(
      { name: 'Usuário', value: `${user.tag} (${user.id})`, inline: false },
      { name: 'Menção', value: `<@${user.id}>`, inline: true },
      { name: 'Servidor', value: guild.name, inline: true }
    )
    .setFooter({ text: `ID do servidor: ${guild.id}` })
    .setTimestamp();

  sendLog(client, 'banimentos', embed);
}

module.exports = {
  logEntrada,
  logSaida,
  logBanimento,
  logDesbanimento,
};
