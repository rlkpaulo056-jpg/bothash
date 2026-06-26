const { 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle,
  EmbedBuilder,
  PermissionsBitField
} = require('discord.js');
const config = require('./config');

// Mapa para rastrear quem já verificou
const verifiedUsers = new Map();

// Criar embed e botão de verificação
function createVerificationPanel() {
  const embed = new EmbedBuilder()
    .setTitle('🔐 Verificação de Membro')
    .setColor(0x0099FF)
    .setDescription(
      '**Bem-vindo ao servidor!**\n\n' +
      'Para ter acesso aos canais, clique no botão abaixo para se verificar.\n\n' +
      '⚡ **É rápido e fácil!**\n' +
      '🎫 Você receberá seu cargo automaticamente\n' +
      '🔓 Acesso liberado aos canais\n' +
      '🎉 Pronto para participar!'
    )
    .setFooter({ text: 'Clique no botão para se verificar' })
    .setTimestamp();

  const button = new ButtonBuilder()
    .setCustomId('btn_verificar')
    .setLabel('✅ Verificar')
    .setStyle(ButtonStyle.Success)
    .setEmoji('🔐');

  const row = new ActionRowBuilder().addComponents(button);

  return { embed, components: [row] };
}

// Processar verificação
async function handleVerification(interaction) {
  try {
    const userId = interaction.user.id;
    const userName = interaction.user.tag;

    // Verifica se já se verificou
    if (verifiedUsers.has(userId)) {
      await interaction.reply({
        content: '⚠️ **Você já está verificado!** Não é necessário verificar novamente.',
        flags: [64]
      });
      return;
    }

    // Buscar cargo de verificado nas configurações
    const cargoVerificadoId = config.verificacao.cargoVerificadoId;
    
    if (!cargoVerificadoId) {
      console.error('❌ Cargo de verificação não configurado no .env!');
      await interaction.reply({
        content: '❌ **Erro:** Cargo de verificação não configurado. Contate um administrador.',
        flags: [64]
      });
      return;
    }

    // Verificar permissões do bot
    const botMember = interaction.guild.members.me;
    if (!botMember.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
      console.error('❌ Bot não tem permissão "Gerenciar Cargos"!');
      await interaction.reply({
        content: '❌ **Erro:** Não tenho permissão para **Gerenciar Cargos**. Contate um administrador.',
        flags: [64]
      });
      return;
    }

    // Buscar membro e cargo
    const member = await interaction.guild.members.fetch(userId);
    const cargo = await interaction.guild.roles.fetch(cargoVerificadoId);

    if (!cargo) {
      console.error(`❌ Cargo de verificação não encontrado: ${cargoVerificadoId}`);
      await interaction.reply({
        content: '❌ **Erro:** Cargo de verificação não existe. Contate um administrador.',
        flags: [64]
      });
      return;
    }

    // Verificar hierarquia de cargos
    if (botMember.roles.highest.position <= cargo.position) {
      console.error(`❌ Cargo do bot (${botMember.roles.highest.name}) está abaixo do cargo ${cargo.name}!`);
      await interaction.reply({
        content: `❌ **Erro:** Meu cargo precisa estar acima de **${cargo.name}**. Contate um administrador.`,
        flags: [64]
      });
      return;
    }

    // Verificar se já tem o cargo
    if (member.roles.cache.has(cargoVerificadoId)) {
      verifiedUsers.set(userId, Date.now());
      await interaction.reply({
        content: '✅ **Você já tem o cargo de verificado!**',
        flags: [64]
      });
      return;
    }

    // Adicionar cargo
    await member.roles.add(cargo);
    verifiedUsers.set(userId, Date.now());

    console.log(`✅ ${userName} foi verificado e recebeu o cargo: ${cargo.name}`);

    // Responder ao usuário
    await interaction.reply({
      content: `🎉 **Parabéns ${interaction.user}!**\n\n` +
               `✅ Você foi **verificado com sucesso!**\n` +
               `🎫 Cargo recebido: **${cargo.name}**\n` +
               `🔓 Agora você tem acesso a todos os canais!\n\n` +
               `**Boas-vindas ao servidor!** 🎊`,
      flags: [64]
    });

    // Log no console
    console.log(`🔐 Verificação: ${userName} (${userId})`);

  } catch (err) {
    console.error('❌ Erro ao processar verificação:', err);
    
    if (err.code === 10062) {
      console.log('⚠️ Interação de verificação expirou');
      return;
    }

    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: '❌ Ocorreu um erro ao verificar. Tente novamente.',
        flags: [64]
      }).catch(() => {});
    }
  }
}

// Resetar verificação de um usuário (para admins)
function resetVerification(userId) {
  verifiedUsers.delete(userId);
  console.log(`🔄 Verificação resetada para usuário: ${userId}`);
}

// Obter estatísticas
function getVerificationStats() {
  return {
    verificados: verifiedUsers.size
  };
}

module.exports = {
  createVerificationPanel,
  handleVerification,
  resetVerification,
  getVerificationStats
};
