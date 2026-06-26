require('dotenv').config();
const fs = require('fs');
const path = require('path');

// Carregar configurações dos servidores
function loadServerConfigs() {
  try {
    const configPath = path.join(__dirname, 'serverConfigs.json');
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }
  } catch (error) {
    console.error('Erro ao carregar serverConfigs.json:', error);
  }
  return {};
}

const serverConfigs = loadServerConfigs();

// Função para obter configuração de um servidor específico
function getServerConfig(guildId) {
  // Procura a configuração do servidor no JSON
  for (const [key, config] of Object.entries(serverConfigs)) {
    if (config.serverGuildId === guildId) {
      return config;
    }
  }
  // Se não encontrar, retorna a configuração padrão
  return serverConfigs.default || {};
}

// Exportar as configurações globais (token) e a função para obter config por servidor
module.exports = {
  token: process.env.DISCORD_TOKEN,
  prefix: process.env.PREFIX || "!",
  adChannelIds: (process.env.AD_CHANNEL_IDS || '').split(',').filter(Boolean),
  logChannelIds: {
    entradas: process.env.LOG_ENTRADAS_ID || '',
    saidas: process.env.LOG_SAIDAS_ID || '',
    banimentos: process.env.LOG_BANIMENTOS_ID || '',
    geral: process.env.LOG_GERAL_ID || '',
  },
  logServerId: process.env.LOG_SERVER_ID || '',
  registro: {
    painelCanalId: process.env.REGISTRO_PAINEL_CANAL_ID || '',
    logCanalId: process.env.REGISTRO_LOG_CANAL_ID || '',
    cargoLiderId: process.env.REGISTRO_CARGO_LIDER_ID || '',
    cargoAprovadoId: process.env.REGISTRO_CARGO_APROVADO_ID || '',
    cargoRecrutadorId: process.env.REGISTRO_CARGO_RECRUTADOR_ID || '',
  },
  
  verificacao: {
    cargoVerificadoId: process.env.VERIFICACAO_CARGO_ID || '',
  },
  
  tickets: {
    logChannelId: process.env.TICKETS_LOG_CHANNEL_ID || '',
    cargoEquipeId: process.env.TICKETS_CARGO_EQUIPE_ID || '',
  },

  // Função para obter config específica do servidor
  getServerConfig,
  serverConfigs,
};
