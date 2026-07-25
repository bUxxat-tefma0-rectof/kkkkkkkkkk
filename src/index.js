require('dotenv').config();
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { initializeDatabase } = require('./database/init');
const InteractiveHandler = require('./handlers/interactiveHandler');
const MessageHandler = require('./handlers/messageHandler');
const AdminService = require('./services/adminService');
const ProductService = require('./services/productService');
const config = require('./config/settings');

class DoguinhaStoreBot {
    constructor() {
        this.client = null;
        this.interactiveHandler = null;
        this.messageHandler = null;
    }

    async initialize() {
        console.log('🐕 DOGUINHA STORE BOT');
        console.log('=======================\n');
        
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
                    '--disable-dev-shm-usage'
                ]
            }
        });

        this.interactiveHandler = new InteractiveHandler(this.client);
        this.messageHandler = new MessageHandler(this.client);

        this.setupEvents();
        await this.client.initialize();
    }

    setupEvents() {
        // QR Code
        this.client.on('qr', (qr) => {
            console.log('\n📱 ESCANEIE O QR CODE NO WHATSAPP:');
            console.log('1. Abra o WhatsApp');
            console.log('2. Configurações > Aparelhos Conectados');
            console.log('3. Conectar um aparelho');
            console.log('4. Escaneie o código abaixo:\n');
            
            qrcode.generate(qr, { small: true });
            console.log('\n⏳ Aguardando conexão...\n');
        });

        // Pronto
        this.client.on('ready', async () => {
            console.log('\n✅ BOT CONECTADO!');
            console.log(`🤖 ${config.bot.name}`);
            console.log(`📱 Número: ${this.client.info.me.user}`);
            console.log('\n🚀 Pronto para receber mensagens!\n');
        });

        // Mensagens
        this.client.on('message', async (message) => {
            try {
                // Ignorar grupos e status
                if (message.from.includes('@g.us') || message.from === 'status@broadcast') {
                    return;
                }

                const phoneNumber = message.from.replace('@c.us', '');
                const UserService = require('./services/userService');
                const user = await UserService.getOrCreateUser(phoneNumber);

                // Verificar se é resposta de lista interativa
                if (message.hasMedia === false && message.body) {
                    // List response
                    if (message.body.startsWith('menu_') || 
                        message.body.startsWith('pix_') || 
                        message.body.startsWith('product_') || 
                        message.body.startsWith('catalog_') ||
                        message.body.startsWith('affiliate_') ||
                        message.body.startsWith('admin_') ||
                        message.body === 'confirm_purchase' ||
                        message.body === 'cancel_purchase' ||
                        message.body === 'menu_back') {
                        
                        await this.interactiveHandler.processListResponse(message, message.body, user);
                        return;
                    }
                }

                // Processar comandos de texto
                await this.messageHandler.processMessage(message);

            } catch (error) {
                console.error('Erro:', error);
                await message.reply('❌ Erro! Digite *menu* para recomeçar.');
            }
        });

        // Reconectar se desconectar
        this.client.on('disconnected', (reason) => {
            console.log('🔌 Desconectado:', reason);
            setTimeout(() => this.initialize(), 5000);
        });
    }
}

// Tratamento de erros global
process.on('uncaughtException', (error) => {
    console.error('❌ Erro crítico:', error);
});

process.on('unhandledRejection', (reason) => {
    console.error('❌ Promise rejeitada:', reason);
});

// Iniciar
const bot = new DoguinhaStoreBot();
bot.initialize().catch(console.error);
