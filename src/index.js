require('dotenv').config();
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { initializeDatabase } = require('./database/init');
const MessageHandler = require('./handlers/messageHandler');
const AdminService = require('./services/adminService');
const PixService = require('./services/pixService');
const config = require('./config/settings');

class DoguinhaStoreBot {
    constructor() {
        this.client = null;
        this.messageHandler = null;
    }

    async initialize() {
        console.log('🐕 Iniciando Doguinha Store Bot...\n');
        
        // Inicializar banco de dados
        console.log('📦 Inicializando banco de dados...');
        await initializeDatabase();
        console.log('✅ Banco de dados pronto!\n');

        // Criar cliente WhatsApp
        this.client = new Client({
            authStrategy: new LocalAuth({
                dataPath: './auth'
            }),
            puppeteer: {
                headless: true,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--no-first-run',
                    '--no-zygote',
                    '--disable-gpu'
                ]
            },
            webVersionCache: {
                type: 'remote',
                remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html'
            }
        });

        // Inicializar gerenciador de mensagens
        this.messageHandler = new MessageHandler(this.client);

        // Configurar eventos
        this.setupEvents();

        // Inicializar cliente
        await this.client.initialize();
    }

    setupEvents() {
        // QR Code
        this.client.on('qr', (qr) => {
            console.log('\n📱 ============ ESCANEIE O QR CODE ============');
            console.log('   Abra o WhatsApp no seu celular');
            console.log('   Vá em: Configurações > Aparelhos Conectados');
            console.log('   Toque em "Conectar um aparelho"');
            console.log('   Escaneie o QR Code abaixo:\n');
            
            qrcode.generate(qr, { small: true });
            
            console.log('\n⏳ Aguardando conexão...\n');
        });

        // Autenticação
        this.client.on('authenticated', () => {
            console.log('🔐 Autenticado com sucesso!');
        });

        // Autenticação falhou
        this.client.on('auth_failure', (msg) => {
            console.error('❌ Falha na autenticação:', msg);
        });

        // Pronto
        this.client.on('ready', async () => {
            console.log('\n✅ Bot conectado e pronto para uso!');
            console.log(`🤖 ${config.bot.name} v${config.bot.version}`);
            
            const info = this.client.info;
            console.log(`📱 Número: ${info.me.user}`);
            console.log(`👤 Nome: ${info.pushname}`);
            console.log('\n🚀 Aguardando mensagens...\n');
            
            // Iniciar verificações automáticas
            this.startAutoChecks();
        });

        // Mensagens
        this.client.on('message', async (message) => {
            await this.messageHandler.processMessage(message);
        });

        // Mensagem de criação
        this.client.on('message_create', async (message) => {
            if (message.fromMe) {
                await this.messageHandler.processMessage(message);
            }
        });

        // Desconectado
        this.client.on('disconnected', (reason) => {
            console.log('🔌 Bot desconectado:', reason);
            console.log('🔄 Tentando reconectar...');
            
            setTimeout(() => {
                this.initialize();
            }, 5000);
        });

        // Erro
        this.client.on('error', (error) => {
            console.error('❌ Erro no cliente:', error);
        });
    }

    startAutoChecks() {
        // Verificar pagamentos expirados a cada 5 minutos
        setInterval(async () => {
            try {
                await PixService.checkExpiredPayments();
            } catch (error) {
                console.error('Erro ao verificar pagamentos expirados:', error);
            }
        }, 5 * 60 * 1000);

        // Backup automático a cada 1 hora
        setInterval(async () => {
            try {
                await this.performBackup();
            } catch (error) {
                console.error('Erro ao realizar backup:', error);
            }
        }, 60 * 60 * 1000);

        console.log('⚙️ Verificações automáticas iniciadas');
    }

    async performBackup() {
        const fs = require('fs').promises;
        const path = require('path');
        
        try {
            const backupDir = './backups';
            await fs.mkdir(backupDir, { recursive: true });
            
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const dbPath = process.env.DB_PATH || './database/store.db';
            const backupPath = path.join(backupDir, `backup_${timestamp}.db`);
            
            await fs.copyFile(dbPath, backupPath);
            
            // Manter apenas últimos 24 backups
            const files = await fs.readdir(backupDir);
            if (files.length > 24) {
                const sortedFiles = files.sort().reverse();
                for (let i = 24; i < sortedFiles.length; i++) {
                    await fs.unlink(path.join(backupDir, sortedFiles[i]));
                }
            }
            
            console.log('💾 Backup realizado com sucesso');
        } catch (error) {
            console.error('Erro no backup:', error);
        }
    }
}

// Tratamento de erros não capturados
process.on('uncaughtException', (error) => {
    console.error('❌ Erro não capturado:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Promise rejeitada não tratada:', reason);
});

// Iniciar bot
const bot = new DoguinhaStoreBot();

console.log('🚀 Iniciando Doguinha Store Bot...\n');
bot.initialize().catch(error => {
    console.error('❌ Erro ao iniciar bot:', error);
    process.exit(1);
});

module.exports = bot;
