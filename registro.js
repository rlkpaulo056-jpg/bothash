const { 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  EmbedBuilder,
  PermissionsBitField,
  StringSelectMenuBuilder
} = require('discord.js');
const config = require('./config');

// Armazenamento de registros pendentes
const pendingRegistrations = new Map();

// Criar painel de registro
function createRegistrationPanel() {
  const embed = new EmbedBuilder()
    .setTitle('📋 Registro de Facção')
    .setDescription(
      'Bem-vindo ao sistema de registro da facção!\n\n' +
      'Clique no botão abaixo para iniciar seu registro.\n' +
      'Você precisará fornecer:\n' +
      '• **Nome RP** - Seu nome roleplay\n' +
      '• **ID do Player** - Sua identificação no jogo\n' +
      '• **Número no Jogo** - Seu número de contato\n' +
      '• **Quem te recrutou** - Nome do membro que te convidou'
    )
    .setColor(0x5865F2)
    .setFooter({ text: 'Preencha todos os campos corretamente' })
    .setTimestamp();

  const button = new ButtonBuilder()
    .setCustomId('btn_registrar')
    .setLabel('📝 Fazer Registro')
    .setStyle(ButtonStyle.Primary);

  const row = new ActionRowBuilder().addComponents(button);

  return { embed, components: [row] };
}

// Criar menu de seleção de recrutador
async function createRecruiterSelectMenu(interaction) {
  try {
    // Buscar membros do servidor (apenas membros com cargos)
    const members = await interaction.guild.members.fetch();
    
    // Filtrar membros (excluir bots e o próprio usuário)
    const validMembers = members.filter(m => 
      !m.user.bot && 
      m.user.id !== interaction.user.id &&
      m.roles.cache.size > 1 // Tem pelo menos um cargo além do @everyone
    );

    // Limitar a 25 opções (limite do Discord)
    const topMembers = validMembers
      .sort((a, b) => b.roles.highest.position - a.roles.highest.position)
      .first(25);

    // Criar opções do menu
    const options = topMembers.map(member => ({
      label: member.displayName.substring(0, 100),
      value: member.user.id,
      description: `${member.user.tag}`.substring(0, 100)
    }));

    const selectMenu = new ActionRowBuilder()
      .addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('select_recruiter')
          .setPlaceholder('Selecione quem te recrutou...')
          .addOptions(options)
      );

    return selectMenu;
  } catch (err) {
    console.error('❌ Erro ao criar menu de recrutadores:', err);
    return null;
  }
}

// Criar modal de formulário (sem campo de recrutador - será selecionado antes)
function createRegistrationModal(recruiterId, recruiterName) {
  const modal = new ModalBuilder()
    .setCustomId('modal_registro')
    .setTitle('Formulário de Registro - Facção');

  const nomeRP = new TextInputBuilder()
    .setCustomId('nome_rp')
    .setLabel('Nome RP')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('Ex: João Silva')
    .setRequired(true)
    .setMaxLength(50);

  const playerID = new TextInputBuilder()
    .setCustomId('player_id')
    .setLabel('ID do Player')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('Ex: 12345')
    .setRequired(true)
    .setMaxLength(20);

  const numeroJogo = new TextInputBuilder()
    .setCustomId('numero_jogo')
    .setLabel('Número no Jogo')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('Ex: 555-0123')
    .setRequired(true)
    .setMaxLength(20);

  // Campo oculto para armazenar o recrutador selecionado
  const recrutadorHidden = new TextInputBuilder()
    .setCustomId('recrutador_id')
    .setLabel('Recrutador ID (NÃO EDITAR)')
    .setStyle(TextInputStyle.Short)
    .setValue(`${recruiterId}|${recruiterName}`)
    .setRequired(true)
    .setMaxLength(100);

  const row1 = new ActionRowBuilder().addComponents(nomeRP);
  const row2 = new ActionRowBuilder().addComponents(playerID);
  const row3 = new ActionRowBuilder().addComponents(numeroJogo);
  const row4 = new ActionRowBuilder().addComponents(recrutadorHidden);

  modal.addComponents(row1, row2, row3, row4);
  return modal;
}

// Verificar permissão do líder (cargo configurado ou administrador)
function checkLeaderPermission(interaction) {
  // Se há um cargo configurado, verifica se o usuário tem esse cargo
  const cargoLiderId = config.registro.cargoLiderId;
  
  if (cargoLiderId) {
    // Verifica se o usuário tem o cargo de líder
    return interaction.member.roles.cache.has(cargoLiderId);
  } else {
    // Se não há cargo configurado, requer permissão de administrador
    return interaction.member.permissions.has(PermissionsBitField.Flags.Administrator);
  }
}

// Criar botões de aprovação/recusa
function createApprovalButtons(registrationId) {
  const approveButton = new ButtonBuilder()
    .setCustomId(`aprovar_${registrationId}`)
    .setLabel('✅ Aprovar')
    .setStyle(ButtonStyle.Success);

  const rejectButton = new ButtonBuilder()
    .setCustomId(`recusar_${registrationId}`)
    .setLabel('❌ Recusar')
    .setStyle(ButtonStyle.Danger);

  const row = new ActionRowBuilder().addComponents(approveButton, rejectButton);
  return row;
}

// Processar submissão do modal
async function handleModalSubmit(interaction) {
  try {
    // Verifica se a interação ainda é válida
    if (interaction.deferred || interaction.replied) {
      console.log('⚠️ Interação já foi respondida, ignorando...');
      return;
    }

    // Extrair valores dos campos
    const nomeRP = interaction.fields.getTextInputValue('nome_rp');
    const playerID = interaction.fields.getTextInputValue('player_id');
    const numeroJogo = interaction.fields.getTextInputValue('numero_jogo');
    const recrutadorData = interaction.fields.getTextInputValue('recrutador_id');
    const [recrutadorId, recrutadorName] = recrutadorData.split('|');
    const recrutador = recrutadorName;

    // Gerar ID único
    const registrationId = Date.now().toString();

    // Criar embed para canal de aprovação
    const embed = new EmbedBuilder()
      .setTitle('📋 Novo Registro Pendente')
      .setColor(0xFFA500)
      .addFields(
        { name: '👤 Nome RP', value: `\`${nomeRP}\``, inline: true },
        { name: '🆔 ID do Player', value: `\`${playerID}\``, inline: true },
        { name: '📱 Número no Jogo', value: `\`${numeroJogo}\``, inline: true },
        { name: '🤝 Recrutado por', value: `\`${recrutador}\``, inline: true },
        { name: '📅 Data do Registro', value: new Date().toLocaleString('pt-BR'), inline: false }
      )
      .setFooter({ text: `ID: ${registrationId} | Solicitante: ${interaction.user.tag}` })
      .setTimestamp();

    // Tenta encontrar o usuário recrutador para mencionar depois
    let recrutadorMention = recrutador;
    try {
      // Remove caracteres especiais e busca por menção ou nome
      const recrutadorClean = recrutador.replace(/[<@!>]/g, '');
      
      // Tenta buscar como ID primeiro
      let recrutadorUser = await interaction.client.users.fetch(recrutadorClean).catch(() => null);
      
      if (recrutadorUser) {
        recrutadorMention = `<@${recrutadorUser.id}>`;
        console.log(`🔍 Recrutador encontrado: ${recrutadorUser.tag}`);
      } else {
        // Tenta buscar por nome no servidor
        const members = await interaction.guild.members.search({ query: recrutador, limit: 1 });
        if (members.size > 0) {
          const member = members.first();
          recrutadorMention = `<@${member.user.id}>`;
          console.log(`🔍 Recrutador encontrado por nome: ${member.user.tag}`);
        } else {
          console.log(`⚠️ Recrutador não encontrado: ${recrutador}`);
        }
      }
    } catch (err) {
      console.log(`⚠️ Erro ao buscar recrutador: ${err.message}`);
    }

    // Salvar dados para uso posterior
    pendingRegistrations.set(registrationId, {
      userId: interaction.user.id,
      userName: interaction.user.tag,
      nomeRP,
      playerID,
      numeroJogo,
      recrutador,
      recrutadorId,
      recrutadorMention,
      timestamp: Date.now()
    });

    console.log(`📋 Novo registro criado: ${nomeRP} (ID: ${registrationId})`);

    // Criar botões de aprovação
    const buttons = createApprovalButtons(registrationId);

    // Responder ao usuário
    await interaction.reply({
      content: '✅ **Registro enviado com sucesso!**\n\nAguarde a aprovação do líder da facção. Você receberá uma notificação no privado quando seu registro for analisado.',
      flags: ['Ephemeral']
    });

    // Enviar embed no canal de logs configurado
    const logCanalId = config.registro.logCanalId;
    let targetChannel;

    if (logCanalId) {
      // Usa o canal configurado no .env
      targetChannel = await interaction.client.channels.fetch(logCanalId).catch(() => null);
      
      if (!targetChannel) {
        console.error(`❌ Canal de logs de registro não encontrado: ${logCanalId}`);
        // Fallback: usa o canal atual se o configurado não existir
        targetChannel = interaction.channel;
      }
    } else {
      // Se não configurado, usa o canal atual
      targetChannel = interaction.channel;
    }

    await targetChannel.send({
      embeds: [embed],
      components: [buttons]
    });

    console.log(`📝 Registro enviado para canal: ${targetChannel.name || targetChannel.id}`);

  } catch (err) {
    // Ignora se a interação expirou - NÃO mostra erro
    if (err.code === 10062) {
      console.log('⚠️ Interação expirou (usuário demorou mais de 3 minutos para preencher o modal)');
      return;
    }
    
    console.error('❌ Erro ao processar registro:', err);
    
    // Só tenta responder se a interação ainda for válida
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({
        content: '❌ Ocorreu um erro ao processar seu registro. Tente novamente.',
        flags: [64]
      }).catch(() => {
        // Se falhar, a interação já expirou, ignora
      });
    } else {
      await interaction.reply({
        content: '❌ Ocorreu um erro ao processar seu registro. Tente novamente.',
        flags: [64]
      }).catch(() => {
        // Se falhar, a interação já expirou, ignora
      });
    }
  }
}

// Processar botão de aprovação
async function handleApprove(interaction, registrationId) {
  try {
    // Verificar permissão
    const hasPermission = checkLeaderPermission(interaction);
    if (!hasPermission) {
      return interaction.reply({
        content: '❌ Você não tem permissão para aprovar registros!',
        flags: [64]
      });
    }

    // Verificar se registro existe
    const registration = pendingRegistrations.get(registrationId);
    if (!registration) {
      return interaction.reply({
        content: '❌ Registro não encontrado ou já foi processado!',
        flags: [64]
      });
    }

    // Atualizar embed original
    const embed = EmbedBuilder.from(interaction.message.embeds[0])
      .setColor(0x00FF00)
      .setTitle('✅ Registro APROVADO')
      .addFields({
        name: '✅ Status',
        value: `Aprovado por **${interaction.user.tag}** em ${new Date().toLocaleString('pt-BR')}`,
        inline: false
      });

    await interaction.update({ embeds: [embed], components: [] });

    console.log(`✅ Registro aprovado: ${registration.nomeRP} (ID: ${registrationId})`);

    // Dar cargo ao membro se configurado
    const cargoAprovadoId = config.registro.cargoAprovadoId;
    let cargoAdicionado = false;

    if (cargoAprovadoId) {
      try {
        // Verifica se o bot tem permissão para gerenciar cargos
        const botMember = interaction.guild.members.me;
        if (!botMember.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
          console.error('❌ Bot não tem permissão "Gerenciar Cargos"!');
          await interaction.channel.send({
            content: '⚠️ **Erro:** Não tenho permissão para **Gerenciar Cargos**. Peça para um administrador verificar minhas permissões.',
            flags: [64]
          }).catch(() => {});
        } else {
          const member = await interaction.guild.members.fetch(registration.userId);
          const cargo = await interaction.guild.roles.fetch(cargoAprovadoId);
          
          if (cargo) {
            // Verifica se o cargo do bot está acima do cargo a ser adicionado
            if (botMember.roles.highest.position <= cargo.position) {
              console.error(`❌ Cargo do bot (${botMember.roles.highest.name}) está abaixo do cargo ${cargo.name}!`);
              await interaction.channel.send({
                content: `⚠️ **Erro:** Meu cargo precisa estar acima de **${cargo.name}** para poder adicioná-lo.`,
                flags: [64]
              }).catch(() => {});
            } else {
              await member.roles.add(cargo);
              cargoAdicionado = true;
              console.log(`🎫 Cargo adicionado: ${cargo.name} para ${registration.userName}`);
            }
          } else {
            console.error(`❌ Cargo não encontrado: ${cargoAprovadoId}`);
          }
        }
      } catch (err) {
        console.error(`❌ Erro ao adicionar cargo: ${err.message}`);
        console.error(err.stack);
      }
    }

    // Mudar nickname do membro: [M] Nome RP [ID]
    try {
      const member = await interaction.guild.members.fetch(registration.userId);
      const novoNick = `[M] ${registration.nomeRP} [${registration.playerID}]`;
      
      // Verifica se o bot tem permissão para gerenciar nicknames
      const botMember = interaction.guild.members.me;
      if (!botMember.permissions.has(PermissionsBitField.Flags.ManageNicknames)) {
        console.log('⚠️ Bot não tem permissão "Gerenciar Nicknames" - pulando mudança de nick');
      } else if (member.roles.highest.position >= botMember.roles.highest.position) {
        console.log(`⚠️ Cargo de ${registration.userName} é igual ou superior ao do bot - não posso mudar o nick`);
      } else {
        await member.setNickname(novoNick);
        console.log(`📝 Nickname alterado para: ${novoNick}`);
      }
    } catch (err) {
      console.log(`⚠️ Não foi possível mudar o nickname: ${err.message}`);
    }

    // Dar cargo ao recrutador (se configurado)
    const cargoRecrutadorId = config.registro.cargoRecrutadorId;
    if (cargoRecrutadorId && registration.recrutadorId) {
      try {
        console.log(`🎯 Tentando dar cargo de recrutador para ${registration.recrutadorMention}...`);
        
        const botMember = interaction.guild.members.me;
        if (!botMember.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
          console.log('⚠️ Bot não tem permissão "Gerenciar Cargos" para dar cargo de recrutador');
        } else {
          const recrutadorMember = await interaction.guild.members.fetch(registration.recrutadorId);
          const cargoRecrutador = await interaction.guild.roles.fetch(cargoRecrutadorId);
          
          if (cargoRecrutador) {
            // Verifica se o recrutador já tem o cargo
            if (recrutadorMember.roles.cache.has(cargoRecrutadorId)) {
              console.log(`ℹ️ ${recrutadorMember.user.tag} já tem o cargo de recrutador`);
            } else if (botMember.roles.highest.position <= cargoRecrutador.position) {
              console.log(`⚠️ Cargo do bot está abaixo do cargo de recrutador`);
            } else {
              await recrutadorMember.roles.add(cargoRecrutador);
              console.log(`🏆 Cargo de recrutador dado para ${recrutadorMember.user.tag}!`);
            }
          } else {
            console.log(`⚠️ Cargo de recrutador não encontrado: ${cargoRecrutadorId}`);
          }
        }
      } catch (err) {
        console.log(`⚠️ Erro ao dar cargo de recrutador: ${err.message}`);
      }
    }

    // Tentar enviar DM ao usuário
    let dmEnviada = false;
    try {
      console.log(`📧 Tentando enviar DM para ${registration.userName} (${registration.userId})`);
      const user = await interaction.client.users.fetch(registration.userId);
      
      let descricaoDM = `Parabéns **${registration.nomeRP}**!\n\n` +
        'Seu registro na facção foi **APROVADO**! 🎊\n\n' +
        '**Dados do seu registro:**\n' +
        `• ID do Player: \`${registration.playerID}\`\n` +
        `• Número: \`${registration.numeroJogo}\`\n` +
        `• Recrutado por: ${registration.recrutadorMention}\n\n`;
      
      if (cargoAdicionado) {
        const cargo = await interaction.guild.roles.fetch(cargoAprovadoId);
        descricaoDM += `🎫 **Você recebeu o cargo:** ${cargo.name}\n\n`;
      }
      
      descricaoDM += 'Entre em contato com o líder para mais instruções e boas-vindas à facção!';
      
      await user.send({
        embeds: [
          new EmbedBuilder()
            .setTitle('🎉 Registro Aprovado!')
            .setColor(0x00FF00)
            .setDescription(descricaoDM)
            .setFooter({ text: 'Nos vemos no jogo!' })
            .setTimestamp()
        ]
      });
      console.log(`✅ DM enviada com sucesso para ${registration.userName}`);
      dmEnviada = true;
    } catch (err) {
      console.log(`⚠️ Não foi possível enviar DM para ${registration.userName}`);
      console.log(`   Motivo: ${err.message}`);
      
      // Mostra o erro completo no console para debug
      if (err.code === 50007) {
        console.log('   → Usuário tem DMs fechadas para este servidor');
      } else if (err.code === 40001) {
        console.log('   → Bot não pode enviar DM para este usuário');
      } else if (err.code === 50278) {
        console.log('   → Usuário não está mais no servidor (no mutual guilds)');
      } else {
        console.log(`   → Código do erro: ${err.code}`);
      }
      
      // Fallback: Enviar notificação no canal mencionando o usuário
      console.log(`📨 Enviando notificação no canal como fallback...`);
      
      let notificacao = `<@${registration.userId}>, seu registro foi **APROVADO**! 🎉\n\n`;
      notificacao += `**Nome RP:** ${registration.nomeRP}\n`;
      notificacao += `**ID do Player:** ${registration.playerID}\n`;
      notificacao += `**Novo Nickname:** ${`[M] ${registration.nomeRP} [${registration.playerID}]`}\n`;
      notificacao += `🤝 **Recrutado por:** ${registration.recrutadorMention}\n`;
      
      if (cargoAdicionado) {
        const cargo = await interaction.guild.roles.fetch(cargoAprovadoId);
        notificacao += `🎫 **Cargo recebido:** ${cargo.name}\n`;
      }
      
      if (cargoRecrutadorId && registration.recrutadorId) {
        try {
          const cargoRecrutador = await interaction.guild.roles.fetch(cargoRecrutadorId);
          if (cargoRecrutador) {
            notificacao += `🏆 **Recrutador recebeu:** ${cargoRecrutador.name}\n`;
          }
        } catch (err) {}
      }
      
      notificacao += '\nEntre em contato com o líder para mais instruções!';
      
      await interaction.channel.send({
        content: notificacao
      });
      
      console.log(`✅ Notificação enviada no canal para ${registration.userName}`);
    }

    // Remover do Map
    pendingRegistrations.delete(registrationId);

  } catch (err) {
    console.error('❌ Erro ao aprovar registro:', err);
    
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: '❌ Ocorreu um erro ao processar a aprovação.',
        flags: [64]
      });
    }
  }
}

// Processar botão de recusa
async function handleReject(interaction, registrationId) {
  try {
    // Verificar permissão
    const hasPermission = checkLeaderPermission(interaction);
    if (!hasPermission) {
      return interaction.reply({
        content: '❌ Você não tem permissão para recusar registros!',
        flags: [64]
      });
    }

    // Verificar se registro existe
    const registration = pendingRegistrations.get(registrationId);
    if (!registration) {
      return interaction.reply({
        content: '❌ Registro não encontrado ou já foi processado!',
        flags: [64]
      });
    }

    // Atualizar embed original
    const embed = EmbedBuilder.from(interaction.message.embeds[0])
      .setColor(0xFF0000)
      .setTitle('❌ Registro RECUSADO')
      .addFields({
        name: '❌ Status',
        value: `Recusado por **${interaction.user.tag}** em ${new Date().toLocaleString('pt-BR')}`,
        inline: false
      });

    await interaction.update({ embeds: [embed], components: [] });

    console.log(`❌ Registro recusado: ${registration.nomeRP} (ID: ${registrationId})`);

    // Tentar enviar DM ao usuário
    try {
      console.log(`📧 Tentando enviar DM de recusa para ${registration.userName} (${registration.userId})`);
      const user = await interaction.client.users.fetch(registration.userId);
      await user.send({
        embeds: [
          new EmbedBuilder()
            .setTitle('❌ Registro Recusado')
            .setColor(0xFF0000)
            .setDescription(
              `Olá **${registration.nomeRP}**,\n\n` +
              'Infelizmente seu registro na facção foi **RECUSADO**.\n\n' +
              'Isso não significa que você não possa tentar novamente no futuro.\n' +
              'Entre em contato com o líder para saber mais detalhes.\n\n' +
              'Boa sorte!'
            )
            .setFooter({ text: 'Você pode tentar novamente mais tarde' })
            .setTimestamp()
        ]
      });
      console.log(`✅ DM de recusa enviada com sucesso para ${registration.userName}`);
    } catch (err) {
      console.log(`⚠️ Não foi possível enviar DM de recusa para ${registration.userName}`);
      console.log(`   Motivo: ${err.message}`);
      
      if (err.code === 50007) {
        console.log('   → Usuário tem DMs fechadas para este servidor');
      } else if (err.code === 40001) {
        console.log('   → Bot não pode enviar DM para este usuário');
      } else if (err.code === 50278) {
        console.log('   → Usuário não está mais no servidor (no mutual guilds)');
      } else {
        console.log(`   → Código do erro: ${err.code}`);
      }
      
      // Fallback: Enviar notificação no canal
      console.log(`📨 Enviando notificação de recusa no canal como fallback...`);
      
      await interaction.channel.send({
        content: `<@${registration.userId}>, seu registro foi **RECUSADO** ❌\n\n` +
          `**Nome RP:** ${registration.nomeRP}\n` +
          'Entre em contato com o líder para mais detalhes.'
      });
      
      console.log(`✅ Notificação de recusa enviada no canal para ${registration.userName}`);
    }

    // Remover do Map
    pendingRegistrations.delete(registrationId);

  } catch (err) {
    console.error('❌ Erro ao recusar registro:', err);
    
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: '❌ Ocorreu um erro ao processar a recusa.',
        flags: [64]
      });
    }
  }
}

// Obter estatísticas de registros
function getRegistrationStats() {
  return {
    pendentes: pendingRegistrations.size
  };
}

module.exports = {
  createRegistrationPanel,
  createRecruiterSelectMenu,
  createRegistrationModal,
  handleModalSubmit,
  handleApprove,
  handleReject,
  getRegistrationStats
};
