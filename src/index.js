require('dotenv').config();

const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    makeInMemoryStore,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore
} = require('@whiskeysockets/baileys');

const pino = require('pino');
const { Boom } = require('@hapi/boom');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

// Serviços
const UserService = require('./services/userService');
const PixService = require('./services/pixService');
const ProductService = require('./services/productService');
const PurchaseService = require('./services/purchaseService');
const MessageService = require('./services/messageService');
const AdminService = require('./services/adminService');
const { initializeDatabase } = require('./database/init');

// Config
const config = require('./config/settings');

// Logger
const logger = pino({
    level: 'silent'
});

// Criar pasta de auth se não existir
const authDir = path.join(__dirname, '..', 'auth');
if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true });
}

// Estado da sessão
let sock = null;
let pairingCode = null;

// Função para perguntar código no terminal
function askQuestion(query) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    return new Promise(resolve => rl.question(query, ans => {
        rl.close();
        resolve(ans);
    }));
}

// Função principal
async function startBot() {
    try {
        // Inicializar banco de dados
        console.log('📦 Inicializando banco de dados...');
        await initializeDatabase();
        console.log('✅ Banco de dados pronto!\n');

        // Carregar estado de autenticação
        const { state, saveCreds } = await useMultiFileAuthState(authDir);
        
        // Buscar versão mais recente
        const { version, isLatest } = await fetchLatestBaileysVersion();
        console.log(`📱 Usando WA v${version.join('.')} ${isLatest ? '(última)' : '(atualizando...)'}`);
        
        // Criar socket
        sock = makeWASocket({
            version,
            logger,
            printQRInTerminal: false, // NÃO mostrar QR Code
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, logger),
            },
            browser: ['Doguinha Store', 'Chrome', '1.0.0'],
            markOnlineOnConnect: true,
            syncFullHistory: false,
            getMessage: async (key) => {
                return { conversation: 'Mensagem antiga' };
            }
        });

        // Salvar credenciais quando atualizar
        sock.ev.on('creds.update', saveCreds);

        // Processar eventos de conexão
        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;
            
            // Se tiver QR Code (modo normal) - NÃO USAR
            if (qr && !pairingCode) {
                console.log('\n📱 MÉTODO ALTERNATIVO - ESCANEIE O QR CODE:');
                console.log('(Se preferir código, aguarde a solicitação)\n');
                
                const qrcode = require('qrcode-terminal');
                qrcode.generate(qr, { small: true });
            }

            // Status da conexão
            if (connection === 'connecting') {
                console.log('🔄 Conectando ao WhatsApp...');
                
                // Pedir código de pareamento
                if (!pairingCode && !sock.authState.creds.registered) {
                    console.log('\n📱 PARECAMENTO POR CÓDIGO');
                    console.log('========================');
                    console.log('1. Abra o WhatsApp no seu celular');
                    console.log('2. Vá em: Configurações > Aparelhos Conectados');
                    console.log('3. Toque em "Conectar um aparelho"');
                    console.log('4. Toque em "Conectar com código"');
                    console.log('5. Digite o código abaixo:\n');
                    
                    // Aguardar código
                    setTimeout(async () => {
                        const code = await askQuestion('📝 Digite o código de 8 dígitos do WhatsApp: ');
                        if (code && code.length === 8) {
                            pairingCode = code;
                            console.log('\n⏳ Pareando com código:', code);
                            console.log('✅ Confirme no celular!\n');
                        } else {
                            console.log('❌ Código inválido! Deve ter 8 dígitos.');
                            console.log('🔄 Reinicie o bot para tentar novamente.');
                        }
                    }, 3000);
                }
            }

            if (connection === 'open') {
                console.log('\n✅ BOT CONECTADO COM SUCESSO!');
                console.log(`🤖 ${config.bot.name}`);
                console.log(`📱 Número: ${sock.user.id.split(':')[0]}`);
                console.log('\n🚀 Pronto para receber mensagens!\n');
                pairingCode = null;
            }

            if (connection === 'close') {
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
                
                console.log('🔌 Conexão fechada:', statusCode);
                
                if (shouldReconnect) {
                    console.log('🔄 Tentando reconectar em 5 segundos...\n');
                    setTimeout(() => {
                        pairingCode = null;
                        startBot();
                    }, 5000);
                } else {
                    console.log('❌ Sessão expirada. Delete a pasta "auth" e reinicie.');
                    process.exit(1);
                }
            }
        });

        // Processar mensagens
        sock.ev.on('messages.upsert', async (m) => {
            const message = m.messages[0];
            if (!message.message) return;
            if (message.key.fromMe) return;
            if (message.key.remoteJid.includes('@g.us')) return; // Ignorar grupos
            
            await processMessage(message);
        });

    } catch (error) {
        console.error('❌ Erro ao iniciar:', error);
        console.log('🔄 Tentando novamente em 5 segundos...\n');
        setTimeout(startBot, 5000);
    }
}

// Processar mensagens recebidas
async function processMessage(msg) {
    try {
        const jid = msg.key.remoteJid;
        const phoneNumber = jid.replace('@s.whatsapp.net', '');
        
        // Pegar texto da mensagem
        let text = '';
        if (msg.message.conversation) {
            text = msg.message.conversation;
        } else if (msg.message.extendedTextMessage?.text) {
            text = msg.message.extendedTextMessage.text;
        } else if (msg.message.buttonsResponseMessage?.selectedButtonId) {
            text = msg.message.buttonsResponseMessage.selectedButtonId;
        } else if (msg.message.listResponseMessage?.singleSelectReply?.selectedRowId) {
            text = msg.message.listResponseMessage.singleSelectReply.selectedRowId;
        }

        if (!text) return;

        // Buscar ou criar usuário
        const user = await UserService.getOrCreateUser(phoneNumber);
        
        console.log(`📩 Mensagem de ${phoneNumber}: ${text}`);

        // MENU PRINCIPAL
        if (text.toLowerCase() === 'oi' || text === 'menu' || text === 'inicio') {
            await sendMainMenu(jid, user);
        }
        // ADICIONAR SALDO
        else if (text === 'menu_add_balance' || text === '1') {
            await sendPixMenu(jid, user);
        }
        // ASSINATURAS
        else if (text === 'menu_products' || text === '2') {
            await sendCatalog(jid, user);
        }
        // ÁREA DO ASSOCIADO
        else if (text === 'menu_affiliate' || text === '3') {
            await sendAffiliateArea(jid, user);
        }
        // SUPORTE
        else if (text === 'menu_support' || text === '4') {
            await sendSupport(jid);
        }
        // PIX VALORES FIXOS
        else if (text === 'pix_5') {
            await processPix(jid, user, 5);
        }
        else if (text === 'pix_8') {
            await processPix(jid, user, 8);
        }
        else if (text === 'pix_20') {
            await processPix(jid, user, 20);
        }
        // PIX PERSONALIZADO
        else if (text === 'pix_custom') {
            await sendMessage(jid, '💎 *Digite o valor desejado:*\n\nExemplo: 50 (para R$ 50,00)');
        }
        // VALOR NUMÉRICO (PIX personalizado)
        else if (!isNaN(text) && parseFloat(text) >= 5) {
            await processPix(jid, user, parseFloat(text));
        }
        // VOLTAR AO MENU
        else if (text === 'menu_back') {
            await sendMainMenu(jid, user);
        }
        // COMPRAR PRODUTO
        else if (text.startsWith('product_')) {
            const productId = text.replace('product_', '');
            await processPurchase(jid, user, productId);
        }
        // ADMIN
        else if (text === 'admin') {
            await sendAdminPanel(jid, user);
        }
        // DEFAULT
        else {
            await sendMainMenu(jid, user);
        }

    } catch (error) {
        console.error('Erro ao processar mensagem:', error);
    }
}

// Função para enviar mensagem
async function sendMessage(jid, text) {
    try {
        await sock.sendMessage(jid, { text: text });
    } catch (error) {
        console.error('Erro ao enviar mensagem:', error);
    }
}

// Função para enviar lista interativa
async function sendInteractiveList(jid, title, buttonText, sections) {
    try {
        await sock.sendMessage(jid, {
            text: title,
            footer: 'Escolha uma opção abaixo',
            title: title,
            buttonText: buttonText,
            sections: sections
        });
    } catch (error) {
        console.error('Erro ao enviar lista:', error);
        // Fallback: enviar como texto
        let fallbackText = `*${title}*\n\n`;
        sections.forEach(section => {
            fallbackText += `_${section.title}_\n`;
            section.rows.forEach(row => {
                fallbackText += `${row.title}\n`;
            });
            fallbackText += '\n';
        });
        await sendMessage(jid, fallbackText);
    }
}

// ============ MENUS ============

async function sendMainMenu(jid, user) {
    const balance = await UserService.getBalance(user.id);
    
    const welcomeMsg = `🐕 *DOGUINHA STORE*\n\n` +
                      `Bem-vindo(a) à melhor loja de assinaturas!\n\n` +
                      `📱 *Seu número:* ${user.phone_number}\n` +
                      `💰 *Saldo:* R$ ${balance.toFixed(2)}\n` +
                      `📧 *Suporte:* ${config.support.telegram}\n\n` +
                      `Escolha uma opção:`;
    
    await sendMessage(jid, welcomeMsg);
    
    // Lista interativa
    const sections = [{
        title: '📋 MENU PRINCIPAL',
        rows: [
            { title: '💸 Adicionar Saldo', rowId: 'menu_add_balance', description: 'Recarregar via PIX' },
            { title: '🛍️ Assinaturas Premium', rowId: 'menu_products', description: 'Ver catálogo' },
            { title: '💼 Área do Associado', rowId: 'menu_affiliate', description: 'Indique e ganhe' },
            { title: '👤 Contato do Suporte', rowId: 'menu_support', description: 'Ajuda' }
        ]
    }];
    
    await sendInteractiveList(jid, '🐕 DOGUINHA STORE', '📱 Ver Opções', sections);
}

async function sendPixMenu(jid, user) {
    const sections = [{
        title: '💰 VALORES DISPONÍVEIS',
        rows: [
            { title: '💵 PIX R$ 5,00', rowId: 'pix_5', description: 'Recarga mínima' },
            { title: '💵 PIX R$ 8,00', rowId: 'pix_8', description: 'Recarga popular' },
            { title: '💵 PIX R$ 20,00', rowId: 'pix_20', description: 'Melhor valor' },
            { title: '✍️ Digite outro valor', rowId: 'pix_custom', description: 'Valor personalizado' }
        ]
    }, {
        title: '🔙 VOLTAR',
        rows: [
            { title: '🔙 Menu Inicial', rowId: 'menu_back', description: 'Voltar' }
        ]
    }];
    
    await sendMessage(jid, '💸 *MENU DE OPÇÕES DE PIX*\n\nEscolha o valor da recarga:');
    await sendInteractiveList(jid, '💸 Opções PIX', '💳 Ver Valores', sections);
}

async function sendCatalog(jid, user) {
    const balance = await UserService.getBalance(user.id);
    const products = await ProductService.getAvailableProducts();
    
    const headerMsg = `🛍️ *ASSINATURAS PREMIUM*\n\n` +
                     `👤 *Cliente:* ${user.phone_number}\n` +
                     `💰 *Saldo:* R$ ${balance.toFixed(2)}\n\n` +
                     `📦 *Produtos disponíveis:*`;
    
    await sendMessage(jid, headerMsg);
    
    if (products.length === 0) {
        await sendMessage(jid, '❌ Nenhum produto disponível.');
        return;
    }
    
    const sections = [{
        title: '📦 CATÁLOGO',
        rows: products.slice(0, 10).map(p => ({
            title: p.name,
            rowId: `product_${p.id}`,
            description: `💰 R$ ${p.price.toFixed(2)} | 📦 ${p.stock} unid.`
        }))
    }];
    
    await sendInteractiveList(jid, '🛍️ Produtos', '📦 Ver Catálogo', sections);
}

async function sendAffiliateArea(jid, user) {
    const ReferralService = require('./services/referralService');
    const stats = await ReferralService.getReferralStats(user.id);
    
    const msg = `💼 *ÁREA DO ASSOCIADO*\n\n` +
               `🔗 *Seu Link:*\n${user.referral_link}\n\n` +
               `📝 *Código:* \`${user.referral_code}\`\n\n` +
               `💰 *Comissão:* R$ ${(user.commission_balance || 0).toFixed(2)}\n` +
               `👥 *Indicados:* ${stats.total_referrals || 0}\n` +
               `📊 *Percentual:* ${config.commission.percentage}%\n\n` +
               `📢 *Divulgação:*\n` +
               `Chame o bot: wa.me/5491161087018\n` +
               `Use o código: ${user.referral_code}`;
    
    await sendMessage(jid, msg);
}

async function sendSupport(jid) {
    const msg = `👤 *SUPORTE*\n\n` +
               `📱 *Telegram:* ${config.support.telegram}\n\n` +
               `⏰ Seg-Sex: 09h-18h\n` +
               `📅 Sáb: 09h-13h\n\n` +
               `ℹ️ Atendimento apenas via Telegram`;
    
    await sendMessage(jid, msg);
}

async function sendAdminPanel(jid, user) {
    const isAdmin = await AdminService.isAdmin(user.phone_number);
    
    if (!isAdmin) {
        await sendMessage(jid, '❌ Acesso negado!');
        return;
    }
    
    const stats = await AdminService.getDashboardStats();
    
    const msg = `👑 *PAINEL ADMIN*\n\n` +
               `👥 Usuários: ${stats.totalUsers || 0}\n` +
               `🛍️ Vendas: ${stats.totalSales || 0}\n` +
               `💰 Receita: R$ ${(stats.totalRevenue || 0).toFixed(2)}\n` +
               `💳 Recargas: ${stats.totalRecharges || 0}\n\n` +
               `Comandos:\n` +
               `📦 *add produto* - Adicionar\n` +
               `✏️ *edit produto* - Editar\n` +
               `📊 *relatorio* - Relatório\n` +
               `📢 *broadcast* - Transmissão`;
    
    await sendMessage(jid, msg);
}

// ============ PIX ============

async function processPix(jid, user, amount) {
    try {
        await sendMessage(jid, '⏳ *Gerando PIX...*');
        
        const pixData = await PixService.generatePix(user.id, amount);
        
        const msg = `💳 *PAGAMENTO PIX*\n\n` +
                   `💰 Valor: R$ ${amount.toFixed(2)}\n` +
                   `🆔 ID: ${pixData.pixId}\n` +
                   `⏰ Expira em: ${config.pix.expirationMinutes} min\n\n` +
                   `📋 *CÓDIGO PIX:*\n` +
                   `\`\`\`${pixData.copyPaste}\`\`\`\n\n` +
                   `✅ Pagamento confirmado automaticamente!`;
        
        await sendMessage(jid, msg);
        
        // Verificar pagamento a cada 10 segundos
        const checkInterval = setInterval(async () => {
            const result = await PixService.checkPaymentStatus(pixData.pixId);
            
            if (result.status === 'approved') {
                clearInterval(checkInterval);
                const newBalance = await UserService.getBalance(user.id);
                await sendMessage(jid, 
                    `✅ *PAGO!*\n` +
                    `💰 Recarga: R$ ${amount.toFixed(2)}\n` +
                    `💵 Saldo: R$ ${newBalance.toFixed(2)}`
                );
            }
        }, 10000);
        
        // Parar após 30 minutos
        setTimeout(() => clearInterval(checkInterval), 30 * 60 * 1000);
        
    } catch (error) {
        await sendMessage(jid, `❌ Erro: ${error.message}`);
    }
}

// ============ COMPRA ============

async function processPurchase(jid, user, productId) {
    const balance = await UserService.getBalance(user.id);
    const product = await ProductService.getProductById(productId);
    
    if (!product) {
        await sendMessage(jid, '❌ Produto não encontrado!');
        return;
    }
    
    if (balance < product.price) {
        await sendMessage(jid, 
            `❌ *Saldo insuficiente!*\n\n` +
            `💰 Seu saldo: R$ ${balance.toFixed(2)}\n` +
            `💵 Preço: R$ ${product.price.toFixed(2)}\n` +
            `📉 Falta: R$ ${(product.price - balance).toFixed(2)}`
        );
        return;
    }
    
    if (product.stock <= 0) {
        await sendMessage(jid, '❌ Produto esgotado!');
        return;
    }
    
    // Confirmar compra
    const result = await PurchaseService.processPurchase(user.id, productId);
    
    if (result.success) {
        const creds = result.credentials;
        await sendMessage(jid,
            `✅ *COMPRA APROVADA!*\n\n` +
            `📦 ${product.name}\n` +
            `💰 R$ ${product.price.toFixed(2)}\n\n` +
            `🔐 *ACESSO:*\n` +
            `📧 Login: \`${creds.login}\`\n` +
            `🔑 Senha: \`${creds.password}\`\n` +
            `📅 Vence: ${creds.expirationDate.toLocaleDateString('pt-BR')}\n\n` +
            `_Guarde os dados!_`
        );
    } else {
        await sendMessage(jid, `❌ ${result.message}`);
    }
}

// Iniciar bot
console.log('🐕 DOGUINHA STORE BOT');
console.log('=====================\n');
startBot().catch(console.error);
