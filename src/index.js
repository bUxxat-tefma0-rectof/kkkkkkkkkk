const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { initializeDatabase } = require('./database/init');
const UserService = require('./services/userService');
const PixService = require('./services/pixService');
const ProductService = require('./services/productService');
const config = require('./config/settings');

// Inicializar banco de dados
initializeDatabase();

// Criar cliente WhatsApp
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});

// Gerar QR Code para pareamento
client.on('qr', (qr) => {
    console.log('\n📱 ESCANEIE O QR CODE ABAIXO NO SEU WHATSAPP:');
    qrcode.generate(qr, { small: true });
    console.log('\n1. Abra o WhatsApp no seu celular');
    console.log('2. Vá em Configurações > Aparelhos Conectados');
    console.log('3. Toque em "Conectar um aparelho"');
    console.log('4. Escaneie o QR Code acima\n');
});

client.on('ready', () => {
    console.log('✅ Bot conectado e pronto para uso!');
    console.log(`🤖 ${config.bot.name} v${config.bot.version}`);
});

client.on('message', async (message) => {
    try {
        // Ignorar mensagens de grupos
        if (message.from.includes('@g.us')) return;
        
        const phoneNumber = message.from.replace('@c.us', '');
        const user = await UserService.getOrCreateUser(phoneNumber);
        
        // Processar comandos
        await handleMessage(message, user);
        
    } catch (error) {
        console.error('Erro ao processar mensagem:', error);
    }
});

async function handleMessage(message, user) {
    const text = message.body.toLowerCase().trim();
    
    // Menu Principal
    if (text === 'oi' || text === 'menu' || text === 'inicio') {
        await sendMainMenu(message, user);
    }
    // Comandos numéricos do menu
    else if (text === '1' || text.includes('adicionar saldo')) {
        await sendPixMenu(message, user);
    }
    else if (text === '2' || text.includes('assinaturas')) {
        await sendCatalog(message, user);
    }
    else if (text === '3' || text.includes('área do associado')) {
        await sendAffiliateArea(message, user);
    }
    else if (text === '4' || text.includes('suporte') || text.includes('contato')) {
        await sendSupport(message, user);
    }
    // Processar valor personalizado PIX
    else if (!isNaN(text) && parseFloat(text) > 0) {
        await processPixPayment(message, user, parseFloat(text));
    }
}

async function sendMainMenu(message, user) {
    const balance = await UserService.getBalance(user.id);
    
    const menuMessage = config.messages.welcome
        .replace('{number}', user.phone_number)
        .replace('{balance}', balance.toFixed(2));
    
    const menuList = [
        { id: '1', title: '💸 Adicionar Saldo' },
        { id: '2', title: '🛍️ Assinaturas Premium' },
        { id: '3', title: '💼 Área do Associado' },
        { id: '4', title: '👤 Contato do Suporte' }
    ];
    
    // Enviar menu interativo
    await message.reply(menuMessage);
    
    let listMessage = '*Menu Principal*\n\n';
    menuList.forEach(item => {
        listMessage += `${item.id}. ${item.title}\n`;
    });
    listMessage += '\n_Digite o número da opção desejada_';
    
    await message.reply(listMessage);
}

async function sendPixMenu(message, user) {
    const pixMessage = config.messages.pixMenu;
    
    const pixOptions = [
        { id: 'pix5', title: 'PIX R$ 5,00', value: 5 },
        { id: 'pix8', title: 'PIX R$ 8,00', value: 8 },
        { id: 'pix20', title: 'PIX R$ 20,00', value: 20 },
        { id: 'custom', title: '💎 Digite outro valor', value: 0 },
        { id: 'back', title: '🔙 Menu Inicial', value: -1 }
    ];
    
    await message.reply(pixMessage);
    
    let listMessage = '*💸 Opções de Recarga*\n\n';
    pixOptions.forEach(option => {
        listMessage += `${option.title}\n`;
    });
    listMessage += '\n_Digite o valor desejado ou escolha uma opção_';
    
    await message.reply(listMessage);
}

async function sendCatalog(message, user) {
    const balance = await UserService.getBalance(user.id);
    
    const catalogMessage = `🛍️ *ASSINATURAS PREMIUM*\n\n` +
                          `👤 Cliente: ${user.phone_number}\n` +
                          `💰 Saldo: R$ ${balance.toFixed(2)}\n\n` +
                          `*Produtos Disponíveis:*`;
    
    await message.reply(catalogMessage);
    
    // Buscar produtos do banco
    const products = await ProductService.getAvailableProducts();
    
    if (products.length === 0) {
        await message.reply('📦 Nenhum produto disponível no momento.');
        return;
    }
    
    let productList = '*📋 Catálogo:*\n\n';
    products.slice(0, 10).forEach((product, index) => {
        productList += `${index + 1}. ${product.name}\n`;
        productList += `   💰 R$ ${product.price.toFixed(2)}\n`;
        productList += `   📦 Estoque: ${product.stock}\n\n`;
    });
    
    productList += '_Digite o número do produto para comprar_';
    
    await message.reply(productList);
}

async function sendAffiliateArea(message, user) {
    const stats = await UserService.getUserStats(user.id);
    
    const affiliateMessage = `💼 *ÁREA DO ASSOCIADO*\n\n` +
                            `🔗 *Seu Link:*\n${user.referral_link}\n\n` +
                            `📝 *Seu Código:*\n${user.referral_code}\n\n` +
                            `💰 Saldo Comissão: R$ ${stats.commission_balance.toFixed(2)}\n` +
                            `👥 Total Indicados: ${stats.total_referrals}\n` +
                            `📊 Comissão: ${config.commission.percentage}%\n\n` +
                            `*Opções:*\n` +
                            `1. 📢 Texto Modelo\n` +
                            `2. 🔙 Menu Inicial`;
    
    await message.reply(affiliateMessage);
}

async function sendSupport(message, user) {
    const supportMessage = `👤 *CONTATO DO SUPORTE*\n\n` +
                          `📱 Telegram: ${config.support.telegram}\n\n` +
                          `ℹ️ O atendimento é realizado exclusivamente via Telegram.\n\n` +
                          `⏰ Horário de atendimento:\n` +
                          `Seg a Sex: 09h às 18h\n` +
                          `Sáb: 09h às 13h`;
    
    await message.reply(supportMessage);
}

// Iniciar o bot
client.initialize();

console.log('🚀 Iniciando Doguinha Store Bot...');
console.log('📱 Aguardando QR Code para pareamento...');
