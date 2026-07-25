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

async function startBot() {
    try {
        ensureDirectories();
        await initializeDatabase();
        console.log('✅ Banco pronto!\n');

        if (!server) {
            server = new KeepAliveServer();
            await server.start();
        }

        const { state, saveCreds } = await useMultiFileAuthState(path.join(__dirname, '..', 'auth'));
        const { version } = await fetchLatestBaileysVersion();
        console.log(`📱 WA v${version.join('.')}\n`);

        sock = makeWASocket({
            version, logger, printQRInTerminal: false,
            auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, logger) },
            browser: ['Doguinha Store', 'Chrome', '1.0.0'],
            markOnlineOnConnect: true, connectTimeoutMs: 60000
        });

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;

            if (connection === 'connecting') {
                console.log('🔄 Conectando...');
                if (!sock.authState.creds.registered) {
                    setTimeout(async () => {
                        console.log('\n📱 ========== CÓDIGO DE PARECAMENTO ==========');
                        console.log('1. WhatsApp > Aparelhos Conectados');
                        console.log('2. Conectar um aparelho');
                        console.log('3. Conectar com código\n');
                        const code = await askQuestion('📝 Código de 8 dígitos: ');
                        if (code && code.length === 8) {
                            try {
                                await sock.requestPairingCode(code);
                                console.log('\n✅ Confirme no celular!\n');
                            } catch (e) {
                                console.log('\n❌ Código inválido! Reinicie.\n');
                            }
                        }
                    }, 3000);
                }
            }

            if (connection === 'open') {
                console.log('\n✅ BOT CONECTADO!');
                console.log(`📱 ${sock.user.id.split(':')[0]}\n`);
            }

            if (connection === 'close') {
                const code = lastDisconnect?.error?.output?.statusCode;
                if (code !== DisconnectReason.loggedOut) {
                    console.log('🔄 Reconectando em 5s...\n');
                    setTimeout(startBot, 5000);
                }
            }
        });

        sock.ev.on('messages.upsert', async (m) => {
            const msg = m.messages[0];
            if (!msg.message || msg.key.fromMe) return;
            const jid = msg.key.remoteJid;
            if (jid.includes('@g.us')) return;
            await processMessage(msg, jid);
        });

    } catch (error) {
        console.error('❌ Erro:', error.message);
        setTimeout(startBot, 10000);
    }
}

async function processMessage(msg, jid) {
    try {
        const phoneNumber = jid.replace('@s.whatsapp.net', '');
        let text = '';
        if (msg.message.conversation) text = msg.message.conversation;
        else if (msg.message.extendedTextMessage?.text) text = msg.message.extendedTextMessage.text;
        else if (msg.message.listResponseMessage?.singleSelectReply?.selectedRowId) text = msg.message.listResponseMessage.singleSelectReply.selectedRowId;
        else if (msg.message.buttonsResponseMessage?.selectedButtonId) text = msg.message.buttonsResponseMessage.selectedButtonId;

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

        // ============ MENUS ============
        if (['oi', 'ola', 'olá', 'menu', 'inicio', 'início', 'start'].includes(text.toLowerCase())) {
            user.balance = await UserService.getBalance(user.id);
            await sock.sendMessage(jid, { text: MessageService.welcome(user) });
            await sendMainMenuList(jid);
        }
        else if (text === 'menu_add_balance' || text === '1') {
            await sock.sendMessage(jid, { text: MessageService.pixMenu() });
            await sendPixMenuList(jid);
        }
        else if (text === 'menu_products' || text === '2') {
            user.balance = await UserService.getBalance(user.id);
            await sock.sendMessage(jid, { text: MessageService.catalog(user) });
            await sendCatalogList(jid);
        }
        else if (text === 'menu_affiliate' || text === '3') {
            const stats = await ReferralService.getReferralStats(user.id);
            await sock.sendMessage(jid, { text: MessageService.affiliate(user, stats) });
            await sendAffiliateList(jid);
        }
        else if (text === 'menu_support' || text === '4') {
            await sock.sendMessage(jid, { text: MessageService.support() });
        }
        else if (text === 'pix_5') await processPix(jid, user, 5);
        else if (text === 'pix_8') await processPix(jid, user, 8);
        else if (text === 'pix_20') await processPix(jid, user, 20);
        else if (text === 'pix_custom') {
            await sock.sendMessage(jid, { text: '💎 *Digite o valor desejado:*\n\n_Exemplo: 50_\n_Mínimo: R$ 5,00_' });
        }
        else if (!isNaN(text) && parseFloat(text) >= 5) {
            await processPix(jid, user, parseFloat(text));
        }
        else if (text === 'menu_back') {
            user.balance = await UserService.getBalance(user.id);
            await sock.sendMessage(jid, { text: MessageService.welcome(user) });
            await sendMainMenuList(jid);
        }
        else if (text.startsWith('product_')) {
            const productId = parseInt(text.replace('product_', ''));
            await handlePurchaseRequest(jid, user, productId);
        }
        else if (text.toLowerCase() === 'confirmar') {
            await confirmPurchase(jid, user);
        }
        else if (text.toLowerCase() === 'cancelar') {
            await sock.sendMessage(jid, { text: '❌ Compra cancelada.' });
            await sendMainMenuList(jid);
        }
        else if (text === 'affiliate_text') {
            const botNumber = sock.user?.id?.split(':')[0] || 'SEU_NUMERO';
            await sock.sendMessage(jid, { text: MessageService.referralText(botNumber, user) });
        }
        else if (text === 'affiliate_withdraw') {
            const bal = user.commission_balance || 0;
            if (bal <= 0) {
                await sock.sendMessage(jid, { text: '❌ Sem comissões para sacar!' });
            } else {
                await ReferralService.withdrawCommission(user.id, bal);
                const nb = await UserService.getBalance(user.id);
                await sock.sendMessage(jid, { text: MessageService.commissionWithdrawn(bal, nb) });
            }
        }
        else if (text === 'admin' || text === 'adm') {
            if (!isAdmin) { await sock.sendMessage(jid, { text: '❌ Acesso negado!' }); return; }
            const stats = await AdminService.getDashboardStats();
            await sock.sendMessage(jid, { text: MessageService.adminPanel(stats) });
        }
        else {
            user.balance = await UserService.getBalance(user.id);
            await sock.sendMessage(jid, { text: MessageService.welcome(user) });
            await sendMainMenuList(jid);
        }
    } catch (error) {
        console.error('Erro:', error);
        await sock.sendMessage(jid, { text: '❌ Erro! Digite *menu*' });
    }
}

// ============ ADMIN COMMANDS ============
async function handleAdminCommand(jid, user, text) {
    const parts = text.split(' ');
    const cmd = parts[0].toLowerCase();

    if (cmd === '/broadcast') {
        const msg = parts.slice(1).join(' ');
        if (!msg) { await sock.sendMessage(jid, { text: '❌ Use: /broadcast MENSAGEM' }); return; }
        const result = await AdminService.broadcastMessage(msg, sock);
        await sock.sendMessage(jid, { text: `✅ Enviadas: ${result.sent}/${result.total}` });
    }
    else if (cmd === '/addproduto') {
        const data = parts.slice(1).join(' ').split('|').map(s => s.trim());
        if (data.length < 3) { await sock.sendMessage(jid, { text: '❌ Use: /addproduto Nome|Preço|Estoque|Categoria' }); return; }
        const [name, price, stock, category] = data;
        const product = await AdminService.addProduct({ name, price: parseFloat(price), stock: parseInt(stock), category: category || 'Geral' });
        await sock.sendMessage(jid, { text: `✅ Produto #${product.id} adicionado!` });
    }
    else if (cmd === '/removerproduto') {
        const id = parseInt(parts[1]);
        if (!id) { await sock.sendMessage(jid, { text: '❌ Use: /removerproduto ID' }); return; }
        await AdminService.removeProduct(id);
        await sock.sendMessage(jid, { text: `✅ Produto #${id} removido!` });
    }
    else if (cmd === '/editarproduto') {
        const data = parts.slice(1).join(' ').split('|').map(s => s.trim());
        if (data.length < 2) { await sock.sendMessage(jid, { text: '❌ Use: /editarproduto ID|Nome|Preço|Estoque' }); return; }
        const [id, name, price, stock] = data;
        const updates = {};
        if (name) updates.name = name;
        if (price) updates.price = parseFloat(price);
        if (stock) updates.stock = parseInt(stock);
        await AdminService.editProduct(parseInt(id), updates);
        await sock.sendMessage(jid, { text: `✅ Produto #${id} editado!` });
    }
    else if (cmd === '/estoque') {
        const data = parts.slice(1).join(' ').split('|').map(s => s.trim());
        if (data.length < 2) { await sock.sendMessage(jid, { text: '❌ Use: /estoque ID|Quantidade' }); return; }
        await AdminService.updateStock(parseInt(data[0]), parseInt(data[1]));
        await sock.sendMessage(jid, { text: `✅ Estoque atualizado!` });
    }
    else if (cmd === '/listarprodutos') {
        const products = await AdminService.listAllProducts();
        let msg = '📦 *TODOS OS PRODUTOS*\n\n';
        products.forEach(p => {
            msg += `🆔 ${p.id} | ${p.name}\n💰 R$ ${p.price.toFixed(2)} | 📦 ${p.stock}\n${p.active ? '✅ Ativo' : '❌ Inativo'}\n\n`;
        });
        await sock.sendMessage(jid, { text: msg });
    }
    else if (cmd === '/usuarios') {
        const result = await AdminService.listUsers();
        let msg = `👥 *USUÁRIOS* (Total: ${result.total})\n\n`;
        result.users.slice(0, 20).forEach(u => {
            msg += `📱 ${u.phone_number}\n💰 R$ ${(u.balance || 0).toFixed(2)}\n🆔 ${u.referral_code}\n\n`;
        });
        await sock.sendMessage(jid, { text: msg });
    }
    else if (cmd === '/usuario') {
        const phone = parts[1];
        if (!phone) { await sock.sendMessage(jid, { text: '❌ Use: /usuario NUMERO' }); return; }
        const u = await AdminService.getUserByPhone(phone);
        if (!u) { await sock.sendMessage(jid, { text: '❌ Usuário não encontrado!' }); return; }
        await sock.sendMessage(jid, { text: `📱 ${u.phone_number}\n💰 Saldo: R$ ${(u.balance||0).toFixed(2)}\n💼 Comissão: R$ ${(u.commission_balance||0).toFixed(2)}\n📝 Código: ${u.referral_code}\n📅 Desde: ${u.created_at}` });
    }
    else if (cmd === '/vendas') {
        const purchases = await AdminService.listPurchases(20);
        let msg = '🛍️ *ÚLTIMAS VENDAS*\n\n';
        purchases.forEach(p => {
            msg += `📱 ${p.phone_number}\n📦 ${p.product_name}\n💰 R$ ${p.amount.toFixed(2)}\n📅 ${p.created_at}\n\n`;
        });
        await sock.sendMessage(jid, { text: msg });
    }
    else if (cmd === '/recargas') {
        const recharges = await AdminService.listRecharges(20);
        let msg = '💳 *ÚLTIMAS RECARGAS*\n\n';
        recharges.forEach(r => {
            msg += `📱 ${r.phone_number}\n💰 R$ ${r.amount.toFixed(2)}\n📊 ${r.status}\n📅 ${r.created_at}\n\n`;
        });
        await sock.sendMessage(jid, { text: msg });
    }
    else if (cmd === '/topvendas') {
        const stats = await AdminService.getDashboardStats();
        let msg = '🏆 *TOP 5 PRODUTOS*\n\n';
        if (stats.topProducts) {
            stats.topProducts.forEach((p, i) => {
                msg += `${i+1}️⃣ ${p.product_name}: ${p.sales_count} vendas\n`;
            });
        }
        await sock.sendMessage(jid, { text: msg });
    }
    else if (cmd === '/config') {
        const data = parts.slice(1).join(' ').split(' ').filter(s => s);
        if (data.length < 2) { await sock.sendMessage(jid, { text: '❌ Use: /config CHAVE VALOR' }); return; }
        const [key, ...value] = data;
        await AdminService.setSetting(key, value.join(' '));
        await sock.sendMessage(jid, { text: `✅ Configuração "${key}" salva!` });
    }
    else if (cmd === '/verconfig') {
        const settings = await AdminService.getAllSettings();
        let msg = '⚙️ *CONFIGURAÇÕES*\n\n';
        settings.forEach(s => { msg += `🔧 ${s.key}: ${s.value}\n`; });
        await sock.sendMessage(jid, { text: msg });
    }
}

// ============ PIX ============
async function processPix(jid, user, amount) {
    if (amount < 5) { await sock.sendMessage(jid, { text: '❌ Mínimo R$ 5,00' }); return; }
    await sock.sendMessage(jid, { text: '⏳ *Gerando PIX...*' });
    
    const pixData = await PixService.generatePix(user.id, amount);
    await sock.sendMessage(jid, { text: MessageService.pixGenerated(pixData, amount) });

    let checks = 0;
    const maxChecks = (config.pix.expirationMinutes * 60) / 10;
    const interval = setInterval(async () => {
        checks++;
        try {
            const result = await PixService.checkPaymentStatus(pixData.pixId);
            if (result.status === 'approved') {
                clearInterval(interval);
                const nb = await UserService.getBalance(user.id);
                await sock.sendMessage(jid, { text: MessageService.paymentApproved(amount, nb) });
            } else if (result.status === 'rejected' || checks >= maxChecks) {
                clearInterval(interval);
            }
        } catch (e) { if (checks >= maxChecks) clearInterval(interval); }
    }, 10000);
}

// ============ COMPRA ============
async function handlePurchaseRequest(jid, user, productId) {
    const balance = await UserService.getBalance(user.id);
    const product = await ProductService.getProductById(productId);
    if (!product) { await sock.sendMessage(jid, { text: '❌ Produto não encontrado!' }); return; }
    if (product.stock <= 0) { await sock.sendMessage(jid, { text: `❌ ${product.name} esgotado!` }); return; }
    if (balance < product.price) {
        await sock.sendMessage(jid, { text: MessageService.insufficientBalance(balance, product.price) });
        return;
    }
    userSelectedProduct[user.id] = productId;
    await sock.sendMessage(jid, { text: MessageService.confirmPurchase(product) });
}

async function confirmPurchase(jid, user) {
    const productId = userSelectedProduct[user.id];
    if (!productId) { await sock.sendMessage(jid, { text: '❌ Nenhum produto selecionado!' }); return; }
    const result = await PurchaseService.processPurchase(user.id, productId);
    if (result.success) {
        await sock.sendMessage(jid, { text: MessageService.purchaseSuccess(result.product, result.credentials) });
        delete userSelectedProduct[user.id];
    } else {
        await sock.sendMessage(jid, { text: `❌ ${result.message}` });
    }
}

// ============ LISTAS INTERATIVAS ============
async function sendMainMenuList(jid) {
    await sock.sendMessage(jid, {
        title: '🐕 DOGUINHA STORE', text: '🐕 DOGUINHA STORE',
        footer: 'Escolha uma opção:', buttonText: '📱 Ver Opções',
        sections: [{ title: '📋 MENU PRINCIPAL', rows: [
            { title: '💸 Adicionar Saldo', rowId: 'menu_add_balance', description: 'Recarregue via PIX' },
            { title: '🛍️ Assinaturas Premium', rowId: 'menu_products', description: 'Veja nosso catálogo' },
            { title: '💼 Área do Associado', rowId: 'menu_affiliate', description: 'Indique e ganhe comissões' },
            { title: '👤 Contato do Suporte', rowId: 'menu_support', description: 'Fale conosco' }
        ]}]
    });
}

async function sendPixMenuList(jid) {
    await sock.sendMessage(jid, {
        title: '💸 Opções PIX', text: '💸 Opções PIX',
        footer: 'Escolha o valor:', buttonText: '💳 Ver Valores',
        sections: [
            { title: '💰 VALORES', rows: [
                { title: '💵 PIX R$ 5,00', rowId: 'pix_5', description: 'Recarga mínima' },
                { title: '💵 PIX R$ 8,00', rowId: 'pix_8', description: 'Recarga popular' },
                { title: '💵 PIX R$ 20,00', rowId: 'pix_20', description: 'Melhor valor' },
                { title: '✍️ Digite outro valor', rowId: 'pix_custom', description: 'Valor personalizado' }
            ]},
            { title: '🔙 VOLTAR', rows: [{ title: '🔙 Menu Inicial', rowId: 'menu_back', description: 'Voltar' }] }
        ]
    });
}

async function sendCatalogList(jid) {
    const products = await ProductService.getAvailableProducts();
    const rows = products.slice(0, 10).map(p => ({
        title: p.name, rowId: `product_${p.id}`,
        description: `💰 R$ ${p.price.toFixed(2)} | 📦 ${p.stock} unid.`
    }));
    await sock.sendMessage(jid, {
        title: '🛍️ Assinaturas', text: '🛍️ Assinaturas',
        footer: 'Escolha um produto:', buttonText: '📦 Ver Produtos',
        sections: [{ title: '📦 CATÁLOGO', rows }]
    });
}

async function sendAffiliateList(jid) {
    await sock.sendMessage(jid, {
        title: '💼 Área do Associado', text: '💼 Área do Associado',
        footer: 'Escolha uma opção:', buttonText: '💼 Opções',
        sections: [
            { title: '📢 OPÇÕES', rows: [
                { title: '📢 Texto Modelo', rowId: 'affiliate_text', description: 'Divulgar' },
                { title: '💰 Sacar Comissão', rowId: 'affiliate_withdraw', description: 'Transferir' }
            ]},
            { title: '🔙 VOLTAR', rows: [{ title: '🔙 Menu Inicial', rowId: 'menu_back', description: 'Voltar' }] }
        ]
    });
}

// ============ INICIAR ============
process.on('uncaughtException', (e) => console.error('❌', e.message));
process.on('unhandledRejection', (e) => console.error('❌', e));

module.exports = { getInstance: () => ({ isConnected: () => sock?.user ? true : false }) };

console.clear();
console.log('🐕 DOGUINHA STORE BOT v2.0\n===========================\n');
startBot().catch(console.error);
