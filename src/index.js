require('dotenv').config();

const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore
} = require('@whiskeysockets/baileys');

const pino = require('pino');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const KeepAliveServer = require('./server');

const UserService = require('./services/userService');
const PixService = require('./services/pixService');
const ProductService = require('./services/productService');
const PurchaseService = require('./services/purchaseService');
const MessageService = require('./services/messageService');
const AdminService = require('./services/adminService');
const ReferralService = require('./services/referralService');
const { initializeDatabase } = require('./database/init');
const config = require('./config/settings');

const logger = pino({ level: 'silent' });

let sock = null;
let server = null;
let userSelectedProduct = {};
let catalogPage = {};

// ============ FUNÇÕES AUXILIARES ============

function ensureDirectories() {
    ['auth', 'logs', 'backups', 'database', 'tmp'].forEach(dir => {
        const p = path.join(__dirname, '..', dir);
        if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
    });
}

function askQuestion(query) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise(resolve => rl.question(query, ans => { rl.close(); resolve(ans); }));
}

// ============ FUNÇÃO PRINCIPAL ============

async function startBot() {
    try {
        ensureDirectories();
        
        console.log('📦 Inicializando banco de dados...');
        await initializeDatabase();
        console.log('✅ Banco de dados pronto!\n');

        if (!server) {
            server = new KeepAliveServer();
            await server.start();
        }

        const { state, saveCreds } = await useMultiFileAuthState(path.join(__dirname, '..', 'auth'));
        const { version } = await fetchLatestBaileysVersion();
        console.log(`📱 WhatsApp Web v${version.join('.')}\n`);

        sock = makeWASocket({
            version,
            logger,
            printQRInTerminal: false,
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, logger),
            },
            browser: ['Doguinha Store', 'Chrome', '1.0.0'],
            markOnlineOnConnect: true,
            connectTimeoutMs: 60000,
            defaultQueryTimeoutMs: 60000,
        });

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;

            if (connection === 'connecting') {
                console.log('🔄 Conectando ao WhatsApp...');
                
                if (!sock.authState.creds.registered) {
                    setTimeout(async () => {
                        console.log('\n📱 ========== CÓDIGO DE PARECAMENTO ==========');
                        console.log('1. Abra o WhatsApp no seu celular');
                        console.log('2. Vá em: Configurações > Aparelhos Conectados');
                        console.log('3. Toque em "Conectar um aparelho"');
                        console.log('4. Toque em "Conectar com código"');
                        console.log('===========================================\n');
                        
                        const code = await askQuestion('📝 Digite o código de 8 dígitos: ');
                        
                        if (code && code.length === 8) {
                            try {
                                await sock.requestPairingCode(code);
                                console.log('\n✅ Código enviado! Confirme no celular...\n');
                            } catch (error) {
                                console.log('\n❌ Código inválido! Reinicie o bot com: npm start\n');
                            }
                        } else {
                            console.log('\n❌ Código deve ter 8 dígitos! Reinicie com: npm start\n');
                        }
                    }, 3000);
                }
            }

            if (connection === 'open') {
                console.log('\n✅ BOT CONECTADO COM SUCESSO!');
                console.log(`🤖 ${config.bot.name}`);
                console.log(`📱 Número: ${sock.user.id.split(':')[0]}`);
                console.log('\n🚀 Aguardando mensagens...\n');
            }

            if (connection === 'close') {
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                console.log(`\n🔌 Conexão fechada (código ${statusCode})`);
                
                if (statusCode !== DisconnectReason.loggedOut) {
                    console.log('🔄 Reconectando em 5 segundos...\n');
                    setTimeout(() => startBot(), 5000);
                } else {
                    console.log('\n❌ Sessão expirada. Delete a pasta "auth" e reinicie.\n');
                }
            }
        });

        sock.ev.on('messages.upsert', async (m) => {
            const msg = m.messages[0];
            if (!msg.message) return;
            if (msg.key.fromMe) return;
            
            const jid = msg.key.remoteJid;
            if (jid.includes('@g.us') || jid === 'status@broadcast') return;
            
            await processMessage(msg, jid);
        });

    } catch (error) {
        console.error('❌ Erro ao iniciar:', error.message);
        console.log('🔄 Tentando novamente em 10 segundos...\n');
        setTimeout(() => startBot(), 10000);
    }
}

// ============ PROCESSAR MENSAGENS ============

async function processMessage(msg, jid) {
    try {
        const phoneNumber = jid.replace('@s.whatsapp.net', '');
        
        // Extrair texto da mensagem
        let text = '';
        if (msg.message.conversation) {
            text = msg.message.conversation;
        } else if (msg.message.extendedTextMessage?.text) {
            text = msg.message.extendedTextMessage.text;
        } else if (msg.message.listResponseMessage?.singleSelectReply?.selectedRowId) {
            text = msg.message.listResponseMessage.singleSelectReply.selectedRowId;
        } else if (msg.message.buttonsResponseMessage?.selectedButtonId) {
            text = msg.message.buttonsResponseMessage.selectedButtonId;
        }

        if (!text) return;
        text = text.trim();
        
        console.log(`📩 [${phoneNumber}]: ${text}`);

        const user = await UserService.getOrCreateUser(phoneNumber);
        const isAdmin = await AdminService.isAdmin(phoneNumber);

        // ============ COMANDOS ADMIN ============
        if (isAdmin && text.startsWith('/')) {
            await handleAdminCommand(jid, user, text);
            return;
        }

        // ============ MENU PRINCIPAL ============
        if (['oi', 'ola', 'olá', 'menu', 'inicio', 'início', 'start'].includes(text.toLowerCase())) {
            const balance = await UserService.getBalance(user.id);
            user.balance = balance;
            await sock.sendMessage(jid, { text: MessageService.welcome(user) });
            await sendMainMenuList(jid);
        }

        // ============ ADICIONAR SALDO ============
        else if (text === 'menu_add_balance' || text === '1') {
            await sock.sendMessage(jid, { text: MessageService.pixMenu() });
            await sendPixMenuList(jid);
        }

        // ============ ASSINATURAS / CATÁLOGO ============
        else if (text === 'menu_products' || text === '2') {
            const balance = await UserService.getBalance(user.id);
            user.balance = balance;
            await sock.sendMessage(jid, { text: MessageService.catalog(user) });
            catalogPage[jid] = 1;
            await sendCatalogList(jid, 1);
        }

        // ============ ÁREA DO ASSOCIADO ============
        else if (text === 'menu_affiliate' || text === '3') {
            const stats = await ReferralService.getReferralStats(user.id);
            await sock.sendMessage(jid, { text: MessageService.affiliate(user, stats) });
            await sendAffiliateList(jid);
        }

        // ============ SUPORTE ============
        else if (text === 'menu_support' || text === '4') {
            await sock.sendMessage(jid, { text: MessageService.support() });
        }

        // ============ PIX VALORES FIXOS ============
        else if (text === 'pix_5') {
            await processPix(jid, user, 5);
        }
        else if (text === 'pix_8') {
            await processPix(jid, user, 8);
        }
        else if (text === 'pix_20') {
            await processPix(jid, user, 20);
        }

        // ============ PIX VALOR PERSONALIZADO ============
        else if (text === 'pix_custom') {
            await sock.sendMessage(jid, { 
                text: '💎 *Digite o valor desejado:*\n\n_Exemplo: 50 (para R$ 50,00)_\n_Mínimo: R$ 5,00_' 
            });
        }

        // ============ VALOR NUMÉRICO (PIX) ============
        else if (!isNaN(text) && parseFloat(text) >= 5) {
            await processPix(jid, user, parseFloat(text));
        }

        // ============ VOLTAR AO MENU ============
        else if (text === 'menu_back') {
            const balance = await UserService.getBalance(user.id);
            user.balance = balance;
            await sock.sendMessage(jid, { text: MessageService.welcome(user) });
            await sendMainMenuList(jid);
        }

        // ============ MOSTRAR MAIS (CATÁLOGO) ============
        else if (text.startsWith('catalog_page_')) {
            const newPage = parseInt(text.replace('catalog_page_', ''));
            await sendCatalogList(jid, newPage);
        }

        // ============ SELECIONAR PRODUTO ============
        else if (text.startsWith('product_')) {
            const productId = parseInt(text.replace('product_', ''));
            await handlePurchaseRequest(jid, user, productId);
        }

        // ============ CONFIRMAR COMPRA ============
        else if (text.toLowerCase() === 'confirmar' || text === 'confirm_purchase') {
            await confirmPurchase(jid, user);
        }

        // ============ CANCELAR COMPRA ============
        else if (text.toLowerCase() === 'cancelar' || text === 'cancel_purchase') {
            delete userSelectedProduct[user.id];
            await sock.sendMessage(jid, { text: '❌ Compra cancelada.' });
            const balance = await UserService.getBalance(user.id);
            user.balance = balance;
            await sock.sendMessage(jid, { text: MessageService.welcome(user) });
            await sendMainMenuList(jid);
        }

        // ============ TEXTO MODELO ============
        else if (text === 'affiliate_text') {
            const botNumber = sock.user?.id?.split(':')[0] || 'SEU_NUMERO';
            await sock.sendMessage(jid, { text: MessageService.referralText(botNumber, user) });
        }

        // ============ SACAR COMISSÃO ============
        else if (text === 'affiliate_withdraw') {
            const commissionBalance = user.commission_balance || 0;
            if (commissionBalance <= 0) {
                await sock.sendMessage(jid, { text: '❌ Você não possui comissões para sacar!' });
            } else {
                await ReferralService.withdrawCommission(user.id, commissionBalance);
                const newBalance = await UserService.getBalance(user.id);
                await sock.sendMessage(jid, { text: MessageService.commissionWithdrawn(commissionBalance, newBalance) });
            }
        }

        // ============ PAINEL ADMIN ============
        else if (text === 'admin' || text === 'adm') {
            if (!isAdmin) {
                await sock.sendMessage(jid, { text: '❌ Acesso negado! Apenas administradores.' });
                return;
            }
            const stats = await AdminService.getDashboardStats();
            await sock.sendMessage(jid, { text: MessageService.adminPanel(stats) });
        }

        // ============ DEFAULT - MENU PRINCIPAL ============
        else {
            const balance = await UserService.getBalance(user.id);
            user.balance = balance;
            await sock.sendMessage(jid, { text: MessageService.welcome(user) });
            await sendMainMenuList(jid);
        }

    } catch (error) {
        console.error('❌ Erro ao processar mensagem:', error);
        try {
            await sock.sendMessage(jid, { text: '❌ Ocorreu um erro. Digite *menu* para recomeçar.' });
        } catch (e) {
            console.error('Erro ao enviar mensagem de erro:', e);
        }
    }
}

// ============ COMANDOS ADMINISTRATIVOS ============

async function handleAdminCommand(jid, user, text) {
    const parts = text.split(' ');
    const cmd = parts[0].toLowerCase();

    // ============ BROADCAST / TRANSMISSÃO ============
    if (cmd === '/broadcast') {
        const message = parts.slice(1).join(' ');
        if (!message) {
            await sock.sendMessage(jid, { text: '❌ Use: /broadcast MENSAGEM' });
            return;
        }
        
        await sock.sendMessage(jid, { text: '📤 *Iniciando transmissão...*' });
        const result = await AdminService.broadcastMessage(message, sock);
        
        await sock.sendMessage(jid, {
            text: `✅ *TRANSMISSÃO CONCLUÍDA!*\n\n` +
                  `📤 Enviadas: ${result.sent}\n` +
                  `❌ Falhas: ${result.failed}\n` +
                  `👥 Total: ${result.total}`
        });
    }

    // ============ ADICIONAR PRODUTO ============
    else if (cmd === '/addproduto') {
        const data = parts.slice(1).join(' ').split('|').map(s => s.trim());
        if (data.length < 3) {
            await sock.sendMessage(jid, { 
                text: '❌ Formato: /addproduto Nome|Preço|Estoque|Categoria\n\n' +
                      'Exemplo: /addproduto Netflix|6.00|33|Streaming' 
            });
            return;
        }
        
        const [name, price, stock, category] = data;
        const product = await AdminService.addProduct({
            name,
            price: parseFloat(price),
            stock: parseInt(stock),
            category: category || 'Geral',
            description: `${name} - Acesso Premium`
        });
        
        await sock.sendMessage(jid, {
            text: `✅ *PRODUTO ADICIONADO!*\n\n` +
                  `🆔 ID: ${product.id}\n` +
                  `📦 Nome: ${name}\n` +
                  `💰 Preço: R$ ${parseFloat(price).toFixed(2)}\n` +
                  `📦 Estoque: ${stock}\n` +
                  `🏷️ Categoria: ${category || 'Geral'}`
        });
    }

    // ============ REMOVER PRODUTO ============
    else if (cmd === '/removerproduto') {
        const id = parseInt(parts[1]);
        if (!id) {
            await sock.sendMessage(jid, { text: '❌ Use: /removerproduto ID' });
            return;
        }
        
        await AdminService.removeProduct(id);
        await sock.sendMessage(jid, { text: `✅ Produto #${id} removido com sucesso!` });
    }

    // ============ EDITAR PRODUTO ============
    else if (cmd === '/editarproduto') {
        const data = parts.slice(1).join(' ').split('|').map(s => s.trim());
        if (data.length < 2) {
            await sock.sendMessage(jid, { 
                text: '❌ Use: /editarproduto ID|Nome|Preço|Estoque|Categoria\n\n' +
                      'Exemplo: /editarproduto 1|Netflix HD|12.00|50|Streaming' 
            });
            return;
        }
        
        const [id, name, price, stock, category] = data;
        const updates = {};
        if (name) updates.name = name;
        if (price) updates.price = parseFloat(price);
        if (stock) updates.stock = parseInt(stock);
        if (category) updates.category = category;
        
        await AdminService.editProduct(parseInt(id), updates);
        await sock.sendMessage(jid, { text: `✅ Produto #${id} editado com sucesso!` });
    }

    // ============ ATUALIZAR ESTOQUE ============
    else if (cmd === '/estoque') {
        const data = parts.slice(1).join(' ').split('|').map(s => s.trim());
        if (data.length < 2) {
            await sock.sendMessage(jid, { text: '❌ Use: /estoque ID|Quantidade\n\nExemplo: /estoque 1|50 (adiciona 50)\n/estoque 1|-10 (remove 10)' });
            return;
        }
        
        await AdminService.updateStock(parseInt(data[0]), parseInt(data[1]));
        await sock.sendMessage(jid, { text: `✅ Estoque do produto #${data[0]} atualizado!` });
    }

    // ============ LISTAR PRODUTOS ============
    else if (cmd === '/listarprodutos') {
        const products = await AdminService.listAllProducts();
        
        if (products.length === 0) {
            await sock.sendMessage(jid, { text: '📦 Nenhum produto cadastrado.' });
            return;
        }
        
        let msg = '📦 *TODOS OS PRODUTOS*\n\n';
        products.forEach(p => {
            const status = p.active ? '✅ Ativo' : '❌ Inativo';
            const stockStatus = p.stock <= 0 ? '🔴 ESGOTADO' : `📦 ${p.stock}`;
            msg += `🆔 ${p.id} | ${p.name}\n`;
            msg += `💰 R$ ${(p.price || 0).toFixed(2)} | ${stockStatus}\n`;
            msg += `🏷️ ${p.category || 'Sem categoria'} | ${status}\n\n`;
        });
        
        await sock.sendMessage(jid, { text: msg });
    }

    // ============ LISTAR USUÁRIOS ============
    else if (cmd === '/usuarios') {
        const result = await AdminService.listUsers(1, 20);
        
        let msg = `👥 *USUÁRIOS CADASTRADOS*\n`;
        msg += `📊 Total: ${result.total}\n\n`;
        
        result.users.forEach((u, i) => {
            msg += `${i + 1}. 📱 ${u.phone_number}\n`;
            msg += `   💰 Saldo: R$ ${(u.balance || 0).toFixed(2)}\n`;
            msg += `   💼 Comissão: R$ ${(u.commission_balance || 0).toFixed(2)}\n`;
            msg += `   📅 Desde: ${u.created_at?.split(' ')[0] || 'N/A'}\n\n`;
        });
        
        await sock.sendMessage(jid, { text: msg });
    }

    // ============ BUSCAR USUÁRIO ============
    else if (cmd === '/usuario') {
        const phone = parts[1];
        if (!phone) {
            await sock.sendMessage(jid, { text: '❌ Use: /usuario NUMERO\n\nExemplo: /usuario 5511999999999' });
            return;
        }
        
        const u = await AdminService.getUserByPhone(phone);
        if (!u) {
            await sock.sendMessage(jid, { text: '❌ Usuário não encontrado!' });
            return;
        }
        
        const msg = `👤 *DADOS DO USUÁRIO*\n\n` +
                    `📱 Telefone: ${u.phone_number}\n` +
                    `💰 Saldo: R$ ${(u.balance || 0).toFixed(2)}\n` +
                    `💼 Comissão: R$ ${(u.commission_balance || 0).toFixed(2)}\n` +
                    `👥 Indicados: ${u.total_referrals || 0}\n` +
                    `📝 Código: ${u.referral_code}\n` +
                    `🔗 Link: ${u.referral_link || 'N/A'}\n` +
                    `📅 Cadastro: ${u.created_at || 'N/A'}\n` +
                    `🔄 Atualizado: ${u.updated_at || 'N/A'}`;
        
        await sock.sendMessage(jid, { text: msg });
    }

    // ============ ÚLTIMAS VENDAS ============
    else if (cmd === '/vendas') {
        const purchases = await AdminService.listPurchases(20);
        
        if (purchases.length === 0) {
            await sock.sendMessage(jid, { text: '🛍️ Nenhuma venda realizada ainda.' });
            return;
        }
        
        let msg = '🛍️ *ÚLTIMAS VENDAS*\n\n';
        purchases.forEach((p, i) => {
            msg += `${i + 1}. 📱 ${p.phone_number}\n`;
            msg += `   📦 ${p.product_name}\n`;
            msg += `   💰 R$ ${(p.amount || 0).toFixed(2)}\n`;
            msg += `   📅 ${p.created_at?.split(' ')[0] || 'N/A'}\n\n`;
        });
        
        await sock.sendMessage(jid, { text: msg });
    }

    // ============ ÚLTIMAS RECARGAS ============
    else if (cmd === '/recargas') {
        const recharges = await AdminService.listRecharges(20);
        
        if (recharges.length === 0) {
            await sock.sendMessage(jid, { text: '💳 Nenhuma recarga realizada ainda.' });
            return;
        }
        
        let msg = '💳 *ÚLTIMAS RECARGAS*\n\n';
        recharges.forEach((r, i) => {
            const statusEmoji = r.status === 'completed' ? '✅' : r.status === 'pending' ? '⏳' : '❌';
            msg += `${i + 1}. 📱 ${r.phone_number}\n`;
            msg += `   💰 R$ ${(r.amount || 0).toFixed(2)}\n`;
            msg += `   ${statusEmoji} ${r.status}\n`;
            msg += `   📅 ${r.created_at?.split(' ')[0] || 'N/A'}\n\n`;
        });
        
        await sock.sendMessage(jid, { text: msg });
    }

    // ============ TOP PRODUTOS ============
    else if (cmd === '/topvendas') {
        const stats = await AdminService.getDashboardStats();
        
        if (!stats.topProducts || stats.topProducts.length === 0) {
            await sock.sendMessage(jid, { text: '🏆 Nenhuma venda registrada ainda.' });
            return;
        }
        
        let msg = '🏆 *TOP 5 PRODUTOS MAIS VENDIDOS*\n\n';
        stats.topProducts.forEach((p, i) => {
            const medalha = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}️⃣`;
            msg += `${medalha} ${p.product_name}\n`;
            msg += `   🛍️ ${p.sales_count} vendas\n`;
            msg += `   💰 R$ ${(p.total_revenue || 0).toFixed(2)}\n\n`;
        });
        
        await sock.sendMessage(jid, { text: msg });
    }

    // ============ DASHBOARD ============
    else if (cmd === '/dashboard') {
        const stats = await AdminService.getDashboardStats();
        
        const msg = `📊 *DASHBOARD ADMINISTRATIVO*\n\n` +
                    `👥 *Usuários:* ${stats.totalUsers || 0}\n` +
                    `🛍️ *Vendas Hoje:* ${stats.todaySales || 0}\n` +
                    `💰 *Faturamento Hoje:* R$ ${(stats.todayRevenue || 0).toFixed(2)}\n` +
                    `📈 *Total Vendas:* ${stats.totalSales || 0}\n` +
                    `💵 *Faturamento Total:* R$ ${(stats.totalRevenue || 0).toFixed(2)}\n` +
                    `💳 *Total Recargas:* ${stats.totalRecharges || 0}\n` +
                    `💸 *Valor Recargas:* R$ ${(stats.totalRechargeAmount || 0).toFixed(2)}`;
        
        await sock.sendMessage(jid, { text: msg });
    }

    // ============ CONFIGURAÇÕES ============
    else if (cmd === '/config') {
        const data = parts.slice(1).join(' ').split(' ').filter(s => s);
        if (data.length < 2) {
            await sock.sendMessage(jid, { 
                text: '❌ Use: /config CHAVE VALOR\n\n' +
                      'Chaves disponíveis:\n' +
                      '• admin_number\n' +
                      '• support_telegram\n' +
                      '• commission_percentage\n' +
                      '• pix_expiration\n' +
                      '• mp_access_token\n' +
                      '• welcome_message\n' +
                      '• catalog_message\n' +
                      '• support_message' 
            });
            return;
        }
        
        const [key, ...value] = data;
        await AdminService.setSetting(key, value.join(' '));
        await sock.sendMessage(jid, { text: `✅ Configuração *${key}* salva com sucesso!` });
    }

    // ============ VER CONFIGURAÇÕES ============
    else if (cmd === '/verconfig') {
        const settings = await AdminService.getAllSettings();
        
        if (settings.length === 0) {
            await sock.sendMessage(jid, { text: '⚙️ Nenhuma configuração personalizada encontrada.' });
            return;
        }
        
        let msg = '⚙️ *CONFIGURAÇÕES ATUAIS*\n\n';
        settings.forEach(s => {
            msg += `🔧 *${s.key}:*\n${s.value}\n\n`;
        });
        
        await sock.sendMessage(jid, { text: msg });
    }

    // ============ AJUDA ============
    else if (cmd === '/ajuda' || cmd === '/help') {
        const msg = `📚 *COMANDOS ADMINISTRATIVOS*\n\n` +
                    `📦 *PRODUTOS:*\n` +
                    `➕ /addproduto Nome|Preço|Estoque|Categoria\n` +
                    `❌ /removerproduto ID\n` +
                    `✏️ /editarproduto ID|Nome|Preço|Estoque|Categoria\n` +
                    `📦 /estoque ID|Quantidade\n` +
                    `📋 /listarprodutos\n\n` +
                    `👥 *USUÁRIOS:*\n` +
                    `📋 /usuarios\n` +
                    `🔍 /usuario NUMERO\n\n` +
                    `🛍️ *VENDAS:*\n` +
                    `📋 /vendas\n` +
                    `💳 /recargas\n` +
                    `🏆 /topvendas\n` +
                    `📊 /dashboard\n\n` +
                    `📢 *TRANSMISSÃO:*\n` +
                    `📤 /broadcast MENSAGEM\n\n` +
                    `⚙️ *CONFIGURAÇÕES:*\n` +
                    `🔧 /config CHAVE VALOR\n` +
                    `📋 /verconfig`;
        
        await sock.sendMessage(jid, { text: msg });
    }

    // ============ COMANDO NÃO RECONHECIDO ============
    else {
        await sock.sendMessage(jid, { text: '❌ Comando não reconhecido. Digite /ajuda para ver todos os comandos.' });
    }
}

// ============ PROCESSAR PIX ============

async function processPix(jid, user, amount) {
    try {
        if (amount < 5) {
            await sock.sendMessage(jid, { text: '❌ Valor mínimo para PIX: R$ 5,00' });
            return;
        }

        if (amount > 1000) {
            await sock.sendMessage(jid, { text: '❌ Valor máximo para PIX: R$ 1.000,00' });
            return;
        }

        await sock.sendMessage(jid, { text: '⏳ *Gerando PIX...*' });

        const pixData = await PixService.generatePix(user.id, amount);
        await sock.sendMessage(jid, { text: MessageService.pixGenerated(pixData, amount) });

        // Verificar pagamento automaticamente
        let checkCount = 0;
        const maxChecks = (config.pix.expirationMinutes * 60) / 10;

        const checkInterval = setInterval(async () => {
            checkCount++;

            try {
                const result = await PixService.checkPaymentStatus(pixData.pixId);

                if (result.status === 'approved') {
                    clearInterval(checkInterval);
                    const newBalance = await UserService.getBalance(user.id);
                    await sock.sendMessage(jid, { 
                        text: MessageService.paymentApproved(amount, newBalance) 
                    });
                } else if (result.status === 'rejected') {
                    clearInterval(checkInterval);
                    await sock.sendMessage(jid, { 
                        text: '❌ Pagamento rejeitado. Tente novamente.' 
                    });
                } else if (checkCount >= maxChecks) {
                    clearInterval(checkInterval);
                    await sock.sendMessage(jid, { 
                        text: '⏰ PIX expirado. Gere um novo PIX.' 
                    });
                }
            } catch (error) {
                if (checkCount >= maxChecks) {
                    clearInterval(checkInterval);
                }
            }
        }, 10000);

    } catch (error) {
        console.error('Erro ao gerar PIX:', error);
        await sock.sendMessage(jid, { 
            text: `❌ Erro ao gerar PIX: ${error.message}\nTente novamente mais tarde.` 
        });
    }
}

// ============ PROCESSAR COMPRA ============

async function handlePurchaseRequest(jid, user, productId) {
    try {
        const balance = await UserService.getBalance(user.id);
        const product = await ProductService.getProductById(productId);

        if (!product) {
            await sock.sendMessage(jid, { text: '❌ Produto não encontrado!' });
            return;
        }

        if (!product.active) {
            await sock.sendMessage(jid, { text: '❌ Este produto não está mais disponível.' });
            return;
        }

        if (product.stock <= 0) {
            await sock.sendMessage(jid, { text: `❌ *${product.name}* está esgotado no momento!` });
            return;
        }

        if (balance < product.price) {
            await sock.sendMessage(jid, { 
                text: MessageService.insufficientBalance(balance, product.price) 
            });
            return;
        }

        // Salvar produto selecionado para confirmação
        userSelectedProduct[user.id] = productId;

        await sock.sendMessage(jid, { text: MessageService.confirmPurchase(product) });

    } catch (error) {
        console.error('Erro ao processar compra:', error);
        await sock.sendMessage(jid, { text: '❌ Erro ao processar compra. Tente novamente.' });
    }
}

async function confirmPurchase(jid, user) {
    try {
        const productId = userSelectedProduct[user.id];

        if (!productId) {
            await sock.sendMessage(jid, { text: '❌ Nenhum produto selecionado! Escolha um produto primeiro.' });
            return;
        }

        const result = await PurchaseService.processPurchase(user.id, productId);

        if (result.success) {
            await sock.sendMessage(jid, { 
                text: MessageService.purchaseSuccess(result.product, result.credentials) 
            });

            // Enviar PDF se disponível
            if (result.pdf) {
                try {
                    await sock.sendMessage(jid, {
                        document: result.pdf,
                        fileName: `Compra_${result.product.name.replace(/\s/g, '_')}.pdf`,
                        mimetype: 'application/pdf'
                    });
                } catch (pdfError) {
                    console.error('Erro ao enviar PDF:', pdfError);
                }
            }

            // Limpar seleção
            delete userSelectedProduct[user.id];

        } else {
            await sock.sendMessage(jid, { text: `❌ ${result.message}` });
        }

    } catch (error) {
        console.error('Erro ao confirmar compra:', error);
        await sock.sendMessage(jid, { text: '❌ Erro ao finalizar compra. Tente novamente.' });
    }
}

// ============ LISTAS INTERATIVAS ============

async function sendMainMenuList(jid) {
    try {
        await sock.sendMessage(jid, {
            title: '🐕 DOGUINHA STORE',
            text: '🐕 DOGUINHA STORE',
            footer: 'Escolha uma opção abaixo:',
            buttonText: '📱 Ver Opções',
            sections: [{
                title: '📋 MENU PRINCIPAL',
                rows: [
                    {
                        title: '💸 Adicionar Saldo',
                        rowId: 'menu_add_balance',
                        description: 'Recarregue via PIX'
                    },
                    {
                        title: '🛍️ Assinaturas Premium',
                        rowId: 'menu_products',
                        description: 'Veja nosso catálogo'
                    },
                    {
                        title: '💼 Área do Associado',
                        rowId: 'menu_affiliate',
                        description: 'Indique e ganhe comissões'
                    },
                    {
                        title: '👤 Contato do Suporte',
                        rowId: 'menu_support',
                        description: 'Fale conosco'
                    }
                ]
            }]
        });
    } catch (error) {
        console.error('Erro ao enviar menu principal:', error);
        // Fallback: enviar como texto simples
        const fallback = `*🐕 DOGUINHA STORE*\n\n` +
                        `1. 💸 Adicionar Saldo\n` +
                        `2. 🛍️ Assinaturas Premium\n` +
                        `3. 💼 Área do Associado\n` +
                        `4. 👤 Contato do Suporte\n\n` +
                        `_Digite o número da opção_`;
        await sock.sendMessage(jid, { text: fallback });
    }
}

async function sendPixMenuList(jid) {
    try {
        await sock.sendMessage(jid, {
            title: '💸 MENU DE OPÇÕES DE PIX',
            text: '💸 MENU DE OPÇÕES DE PIX',
            footer: 'Escolha o valor da recarga:',
            buttonText: '💳 Ver Valores',
            sections: [
                {
                    title: '💰 VALORES DISPONÍVEIS',
                    rows: [
                        {
                            title: '💵 PIX R$ 5,00',
                            rowId: 'pix_5',
                            description: 'Recarga mínima'
                        },
                        {
                            title: '💵 PIX R$ 8,00',
                            rowId: 'pix_8',
                            description: 'Recarga popular'
                        },
                        {
                            title: '💵 PIX R$ 20,00',
                            rowId: 'pix_20',
                            description: 'Melhor valor'
                        },
                        {
                            title: '✍️ Digite outro valor',
                            rowId: 'pix_custom',
                            description: 'Valor personalizado'
                        }
                    ]
                },
                {
                    title: '🔙 VOLTAR',
                    rows: [
                        {
                            title: '🔙 Menu Inicial',
                            rowId: 'menu_back',
                            description: 'Voltar ao menu principal'
                        }
                    ]
                }
            ]
        });
    } catch (error) {
        console.error('Erro ao enviar menu PIX:', error);
        const fallback = `*💸 MENU PIX*\n\n` +
                        `1. 💵 PIX R$ 5,00\n` +
                        `2. 💵 PIX R$ 8,00\n` +
                        `3. 💵 PIX R$ 20,00\n` +
                        `4. ✍️ Digite outro valor\n\n` +
                        `_Digite o número ou valor_`;
        await sock.sendMessage(jid, { text: fallback });
    }
}

async function sendCatalogList(jid, page = 1) {
    try {
        const products = await ProductService.getAvailableProducts();
        const totalProducts = products.length;
        const productsPerPage = 10;
        const totalPages = Math.ceil(totalProducts / productsPerPage);

        // Se não houver produtos
        if (totalProducts === 0) {
            await sock.sendMessage(jid, { text: '📦 *Nenhum produto disponível no momento.*' });
            return;
        }

        // Calcular produtos da página atual
        const start = (page - 1) * productsPerPage;
        const end = start + productsPerPage;
        const pageProducts = products.slice(start, end);

        // Salvar página atual
        catalogPage[jid] = page;

        // Criar seções
        const sections = [{
            title: `📦 CATÁLOGO (Página ${page}/${totalPages})`,
            rows: pageProducts.map(p => ({
                title: p.name,
                rowId: `product_${p.id}`,
                description: `💰 R$ ${p.price.toFixed(2)} | 📦 ${p.stock} unid.`
            }))
        }];

        // Adicionar botão "Mostrar Mais" se houver próxima página
        if (page < totalPages) {
            sections.push({
                title: '📄 NAVEGAÇÃO',
                rows: [{
                    title: '📄 Mostrar Mais Produtos',
                    rowId: `catalog_page_${page + 1}`,
                    description: `Ver página ${page + 1} de ${totalPages}`
                }]
            });
        }

        // Se não for a primeira página, adicionar "Voltar Página"
        if (page > 1) {
            if (!sections[1]) {
                sections.push({ title: '📄 NAVEGAÇÃO', rows: [] });
            }
            sections[1].rows.unshift({
                title: '⬅️ Página Anterior',
                rowId: `catalog_page_${page - 1}`,
                description: `Voltar para página ${page - 1}`
            });
        }

        // Sempre adicionar botão voltar ao menu
        sections.push({
            title: '🔙 VOLTAR',
            rows: [{
                title: '🔙 Menu Inicial',
                rowId: 'menu_back',
                description: 'Voltar ao menu principal'
            }]
        });

        // Enviar lista interativa
        await sock.sendMessage(jid, {
            title: '🛍️ Assinaturas Premium',
            text: `🛍️ *ASSINATURAS PREMIUM*\n\n📄 Página ${page} de ${totalPages}\n📦 Total: ${totalProducts} produtos`,
            footer: 'Escolha um produto abaixo:',
            buttonText: '📦 Ver Produtos',
            sections: sections
        });

    } catch (error) {
        console.error('Erro ao enviar catálogo:', error);
        const fallback = `*🛍️ CATÁLOGO*\n\nErro ao carregar produtos. Tente novamente.`;
        await sock.sendMessage(jid, { text: fallback });
    }
}

async function sendAffiliateList(jid) {
    try {
        await sock.sendMessage(jid, {
            title: '💼 Área do Associado',
            text: '💼 Área do Associado',
            footer: 'Escolha uma opção:',
            buttonText: '💼 Opções',
            sections: [
                {
                    title: '📢 OPÇÕES',
                    rows: [
                        {
                            title: '📢 Texto Modelo',
                            rowId: 'affiliate_text',
                            description: 'Mensagem pronta para divulgação'
                        },
                        {
                            title: '💰 Sacar Comissão',
                            rowId: 'affiliate_withdraw',
                            description: 'Transferir comissão para saldo'
                        }
                    ]
                },
                {
                    title: '🔙 VOLTAR',
                    rows: [
                        {
                            title: '🔙 Menu Inicial',
                            rowId: 'menu_back',
                            description: 'Voltar ao menu principal'
                        }
                    ]
                }
            ]
        });
    } catch (error) {
        console.error('Erro ao enviar área do associado:', error);
        const fallback = `*💼 ÁREA DO ASSOCIADO*\n\n` +
                        `1. 📢 Texto Modelo\n` +
                        `2. 💰 Sacar Comissão\n\n` +
                        `_Digite o número da opção_`;
        await sock.sendMessage(jid, { text: fallback });
    }
}

// ============ TRATAMENTO DE ERROS GLOBAL ============

process.on('uncaughtException', (error) => {
    console.error('❌ Erro não capturado:', error.message);
});

process.on('unhandledRejection', (reason) => {
    console.error('❌ Promise rejeitada:', reason);
});

process.on('SIGINT', () => {
    console.log('\n🛑 Encerrando bot...');
    if (server) server.stop();
    process.exit(0);
});

// ============ EXPORTAR PARA O SERVIDOR ============

module.exports = {
    getInstance: () => ({
        isConnected: () => sock?.user ? true : false
    })
};

// ============ INICIAR BOT ============

console.clear();
console.log('🐕 DOGUINHA STORE BOT v2.0');
console.log('===========================');
console.log('📱 Pareamento por código');
console.log('🚀 Deploy no Render\n');

startBot().catch(console.error);
