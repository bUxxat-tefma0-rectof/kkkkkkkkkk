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
const ConfigService = require('./services/configService');
const AdminConfigHandler = require('./handlers/adminConfigHandler');
const { initializeDatabase } = require('./database/init');
const config = require('./config/settings');

const logger = pino({ level: 'silent' });

let sock = null;
let server = null;
let userSelectedProduct = {};
let catalogPage = {};
let adminConfigHandler = null;

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

        adminConfigHandler = new AdminConfigHandler(sock);

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

        if (global.awaitingConfig && global.awaitingConfig[jid]) {
            const configKey = global.awaitingConfig[jid];
            await adminConfigHandler.saveConfig(jid, configKey, text);
            return;
        }

        if (isAdmin && text.startsWith('/')) {
            await handleAdminCommand(jid, user, text);
            return;
        }

        if (['oi', 'ola', 'olá', 'menu', 'inicio', 'início', 'start'].includes(text.toLowerCase())) {
            await showMainMenu(jid, user);
        }
        else if (text === 'menu_add_balance' || text === '1') {
            await sock.sendMessage(jid, { text: await ConfigService.get('pix_menu_message') });
            await sendPixMenuList(jid);
        }
        else if (text === 'menu_products' || text === '2') {
            await showCatalog(jid, user);
        }
        else if (text === 'menu_affiliate' || text === '3') {
            await showAffiliateArea(jid, user);
        }
        else if (text === 'menu_support' || text === '4') {
            const supportMsg = await ConfigService.get('support_message');
            await sock.sendMessage(jid, { text: supportMsg });
        }
        else if (text === 'pix_5') await processPix(jid, user, 5);
        else if (text === 'pix_8') await processPix(jid, user, 8);
        else if (text === 'pix_20') await processPix(jid, user, 20);
        else if (text === 'pix_custom') {
            await sock.sendMessage(jid, { text: '💎 *Digite o valor desejado:*\n\n_Exemplo: 50 (para R$ 50,00)_\n_Mínimo: R$ 5,00_' });
        }
        else if (!isNaN(text) && parseFloat(text) >= 5) {
            await processPix(jid, user, parseFloat(text));
        }
        else if (text === 'menu_back') {
            await showMainMenu(jid, user);
        }
        else if (text.startsWith('catalog_page_')) {
            const newPage = parseInt(text.replace('catalog_page_', ''));
            await sendCatalogList(jid, newPage);
        }
        else if (text.startsWith('product_')) {
            const productId = parseInt(text.replace('product_', ''));
            await handlePurchaseRequest(jid, user, productId);
        }
        else if (text.toLowerCase() === 'confirmar' || text === 'confirm_purchase') {
            await confirmPurchase(jid, user);
        }
        else if (text.toLowerCase() === 'cancelar' || text === 'cancel_purchase') {
            delete userSelectedProduct[user.id];
            await sock.sendMessage(jid, { text: '❌ Compra cancelada.' });
            await showMainMenu(jid, user);
        }
        else if (text === 'affiliate_text') {
            const botNumber = sock.user?.id?.split(':')[0] || 'SEU_NUMERO';
            await sock.sendMessage(jid, { text: MessageService.referralText(botNumber, user) });
        }
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
        else if (text.startsWith('config_')) {
            if (!isAdmin) {
                await sock.sendMessage(jid, { text: '❌ Acesso negado!' });
                return;
            }
            await adminConfigHandler.handleConfigCommand(jid, text, []);
        }
        else if (text === 'admin' || text === 'adm') {
            if (!isAdmin) {
                await sock.sendMessage(jid, { text: '❌ Acesso negado! Apenas administradores.' });
                return;
            }
            await showAdminPanel(jid);
        }
        else if (text === 'admin_back') {
            await showAdminPanel(jid);
        }
        else {
            await showMainMenu(jid, user);
        }

    } catch (error) {
        console.error('❌ Erro ao processar mensagem:', error);
        try {
            await sock.sendMessage(jid, { text: '❌ Ocorreu um erro. Digite *menu* para recomeçar.' });
        } catch (e) {}
    }
}

// ============ MENUS ============

async function showMainMenu(jid, user) {
    const balance = await UserService.getBalance(user.id);
    user.balance = balance;
    
    let welcomeMsg = await ConfigService.get('welcome_message');
    welcomeMsg = welcomeMsg.replace('{number}', user.phone_number);
    welcomeMsg = welcomeMsg.replace('{balance}', balance.toFixed(2));
    
    if (!welcomeMsg.includes('Telegram') && !welcomeMsg.includes('Suporte')) {
        const telegram = await ConfigService.get('telegram_support');
        welcomeMsg += `\n\n📧 *Suporte:* ${telegram}`;
    }
    
    await sock.sendMessage(jid, { text: welcomeMsg });
    await sendMainMenuList(jid);
}

async function showCatalog(jid, user) {
    const balance = await UserService.getBalance(user.id);
    user.balance = balance;
    
    let catalogMsg = await ConfigService.get('catalog_message');
    catalogMsg = catalogMsg.replace('{number}', user.phone_number);
    catalogMsg = catalogMsg.replace('{balance}', balance.toFixed(2));
    
    await sock.sendMessage(jid, { text: catalogMsg });
    catalogPage[jid] = 1;
    await sendCatalogList(jid, 1);
}

async function showAffiliateArea(jid, user) {
    const stats = await ReferralService.getReferralStats(user.id);
    const commissionPct = await ConfigService.get('commission_percentage');
    
    const msg = `💼 *ÁREA DO ASSOCIADO*\n\n` +
               `🔗 *Link:* ${user.referral_link || 'Gerando...'}\n` +
               `📝 *Código:* \`${user.referral_code}\`\n\n` +
               `💰 *Comissão:* R$ ${(user.commission_balance || 0).toFixed(2)}\n` +
               `👥 *Indicados:* ${stats.total_referrals || 0}\n` +
               `📊 *Percentual:* ${commissionPct}%`;
    
    await sock.sendMessage(jid, { text: msg });
    await sendAffiliateList(jid);
}

async function showAdminPanel(jid) {
    const stats = await AdminService.getDashboardStats();
    const adminMsg = MessageService.adminPanel(stats);
    
    await sock.sendMessage(jid, { text: adminMsg });
}

// ============ PIX ============

async function processPix(jid, user, amount) {
    try {
        const minValue = parseFloat(await ConfigService.get('pix_min_value') || '5');
        if (amount < minValue) {
            await sock.sendMessage(jid, { text: `❌ Valor mínimo: R$ ${minValue.toFixed(2)}` });
            return;
        }

        await sock.sendMessage(jid, { text: '⏳ *Gerando PIX...*' });

        const pixData = await PixService.generatePix(user.id, amount);
        
        const pixExpiration = await ConfigService.get('pix_expiration');
        const expireDate = new Date(Date.now() + parseInt(pixExpiration) * 60000);
        
        const msg = `💳 *PAGAMENTO PIX*\n\n` +
                   `💰 *Valor:* R$ ${amount.toFixed(2)}\n` +
                   `🆔 *ID:* ${pixData.pixId}\n` +
                   `⏰ *Vencimento:* ${expireDate.toLocaleString('pt-BR')}\n\n` +
                   `📋 *CÓDIGO COPIA E COLA:*\n` +
                   `\`\`\`${pixData.copyPaste}\`\`\`\n\n` +
                   `⚠️ Expira em ${pixExpiration} minutos\n` +
                   `✅ Confirmação automática!`;
        
        await sock.sendMessage(jid, { text: msg });

        let checkCount = 0;
        const maxChecks = (parseInt(pixExpiration) * 60) / 10;

        const checkInterval = setInterval(async () => {
            checkCount++;
            try {
                const result = await PixService.checkPaymentStatus(pixData.pixId);
                if (result.status === 'approved') {
                    clearInterval(checkInterval);
                    const newBalance = await UserService.getBalance(user.id);
                    await sock.sendMessage(jid, { 
                        text: `✅ *PAGAMENTO APROVADO!*\n\n💸 Recarga: R$ ${amount.toFixed(2)}\n💰 Novo saldo: R$ ${newBalance.toFixed(2)}` 
                    });
                } else if (result.status === 'rejected' || checkCount >= maxChecks) {
                    clearInterval(checkInterval);
                }
            } catch (e) {
                if (checkCount >= maxChecks) clearInterval(checkInterval);
            }
        }, 10000);

    } catch (error) {
        await sock.sendMessage(jid, { text: `❌ Erro: ${error.message}` });
    }
}

// ============ COMPRA ============

async function handlePurchaseRequest(jid, user, productId) {
    try {
        const balance = await UserService.getBalance(user.id);
        const product = await ProductService.getProductById(productId);

        if (!product) {
            await sock.sendMessage(jid, { text: '❌ Produto não encontrado!' });
            return;
        }

        if (product.stock <= 0) {
            await sock.sendMessage(jid, { text: `❌ *${product.name}* esgotado!` });
            return;
        }

        if (balance < product.price) {
            const msg = await ConfigService.get('insufficient_balance_message');
            const finalMsg = msg.replace('{balance}', balance.toFixed(2)).replace('{price}', product.price.toFixed(2));
            await sock.sendMessage(jid, { text: finalMsg });
            return;
        }

        userSelectedProduct[user.id] = productId;

        await sock.sendMessage(jid, {
            text: `🛒 *CONFIRMAR COMPRA*\n\n` +
                  `📦 Produto: ${product.name}\n` +
                  `💰 Valor: R$ ${product.price.toFixed(2)}\n` +
                  `📦 Estoque: ${product.stock} unid.\n\n` +
                  `Digite *confirmar* para comprar\n` +
                  `Digite *cancelar* para desistir`
        });

    } catch (error) {
        console.error('Erro ao processar compra:', error);
        await sock.sendMessage(jid, { text: '❌ Erro ao processar compra.' });
    }
}

async function confirmPurchase(jid, user) {
    try {
        const productId = userSelectedProduct[user.id];
        if (!productId) {
            await sock.sendMessage(jid, { text: '❌ Nenhum produto selecionado!' });
            return;
        }

        const result = await PurchaseService.processPurchase(user.id, productId);

        if (result.success) {
            await sock.sendMessage(jid, {
                text: `✅ *COMPRA REALIZADA!*\n\n` +
                      `📦 ${result.product.name}\n` +
                      `💰 R$ ${result.product.price.toFixed(2)}\n\n` +
                      `🔐 *DADOS DE ACESSO:*\n` +
                      `📧 Login: \`${result.credentials.login}\`\n` +
                      `🔑 Senha: \`${result.credentials.password}\`\n` +
                      `📅 Vence: ${result.credentials.expirationDate.toLocaleDateString('pt-BR')}\n\n` +
                      `⚠️ *Guarde esses dados!*`
            });

            delete userSelectedProduct[user.id];
        } else {
            await sock.sendMessage(jid, { text: `❌ ${result.message}` });
        }

    } catch (error) {
        console.error('Erro ao confirmar compra:', error);
        await sock.sendMessage(jid, { text: '❌ Erro ao finalizar compra.' });
    }
}

// ============ ADMIN COMMANDS ============

async function handleAdminCommand(jid, user, text) {
    const parts = text.split(' ');
    const cmd = parts[0].toLowerCase();

    if (cmd === '/broadcast') {
        const message = parts.slice(1).join(' ');
        if (!message) {
            await sock.sendMessage(jid, { text: '❌ Use: /broadcast MENSAGEM' });
            return;
        }
        await sock.sendMessage(jid, { text: '📤 *Iniciando transmissão...*' });
        const result = await AdminService.broadcastMessage(message, sock);
        await sock.sendMessage(jid, { text: `✅ Enviadas: ${result.sent}/${result.total}` });
    }
    else if (cmd === '/addproduto') {
        const data = parts.slice(1).join(' ').split('|').map(s => s.trim());
        if (data.length < 3) {
            await sock.sendMessage(jid, { text: '❌ Use: /addproduto Nome|Preço|Estoque|Categoria' });
            return;
        }
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
    else if (cmd === '/dashboard') {
        const stats = await AdminService.getDashboardStats();
        const msg = `📊 *DASHBOARD*\n\n👥 Usuários: ${stats.totalUsers || 0}\n💰 Faturamento: R$ ${(stats.totalRevenue || 0).toFixed(2)}`;
        await sock.sendMessage(jid, { text: msg });
    }
    else if (cmd === '/usuarios') {
        const result = await AdminService.listUsers(1, 20);
        let msg = `👥 *USUÁRIOS* (Total: ${result.total})\n\n`;
        result.users.forEach((u, i) => { msg += `${i + 1}. 📱 ${u.phone_number} | 💰 R$ ${(u.balance || 0).toFixed(2)}\n`; });
        await sock.sendMessage(jid, { text: msg });
    }
    else if (cmd === '/comissao') {
        const pct = parts[1];
        if (!pct) { await sock.sendMessage(jid, { text: '❌ Use: /comissao PORCENTAGEM' }); return; }
        await ConfigService.setCommission(pct);
        await sock.sendMessage(jid, { text: `✅ Comissão alterada para ${pct}%!` });
    }
    else if (cmd === '/telegram') {
        const telegram = parts[1];
        if (!telegram) { await sock.sendMessage(jid, { text: '❌ Use: /telegram @USUARIO' }); return; }
        await ConfigService.setTelegramSupport(telegram);
        await sock.sendMessage(jid, { text: `✅ Telegram alterado para ${telegram}!` });
    }
    else if (cmd === '/mercadopago') {
        const token = parts[1];
        if (!token) { await sock.sendMessage(jid, { text: '❌ Use: /mercadopago TOKEN' }); return; }
        await ConfigService.setMercadoPago(token);
        await sock.sendMessage(jid, { text: '✅ Token Mercado Pago configurado!' });
    }
    else if (cmd === '/ajuda' || cmd === '/help') {
        const msg = `📚 *COMANDOS ADMIN*\n\n` +
                    `📦 /addproduto Nome|Preço|Estoque|Categoria\n` +
                    `❌ /removerproduto ID\n` +
                    `👥 /usuarios\n` +
                    `📊 /dashboard\n` +
                    `📤 /broadcast MENSAGEM\n` +
                    `💰 /comissao PORCENTAGEM\n` +
                    `📧 /telegram @USUARIO\n` +
                    `💳 /mercadopago TOKEN`;
        await sock.sendMessage(jid, { text: msg });
    }
}

// ============ LISTAS INTERATIVAS ============

async function sendMainMenuList(jid) {
    try {
        await sock.sendMessage(jid, {
            title: '🐕 DOGUINHA STORE', text: '🐕 DOGUINHA STORE',
            footer: 'Escolha uma opção abaixo:', buttonText: '📱 Ver Opções',
            sections: [{
                title: '📋 MENU PRINCIPAL',
                rows: [
                    { title: '💸 Adicionar Saldo', rowId: 'menu_add_balance', description: 'Recarregue via PIX' },
                    { title: '🛍️ Assinaturas Premium', rowId: 'menu_products', description: 'Veja nosso catálogo' },
                    { title: '💼 Área do Associado', rowId: 'menu_affiliate', description: 'Indique e ganhe comissões' },
                    { title: '👤 Contato do Suporte', rowId: 'menu_support', description: 'Fale conosco' }
                ]
            }]
        });
    } catch (error) {
        await sock.sendMessage(jid, { text: '*🐕 DOGUINHA STORE*\n\n1. 💸 Adicionar Saldo\n2. 🛍️ Assinaturas Premium\n3. 💼 Área do Associado\n4. 👤 Contato do Suporte' });
    }
}

async function sendPixMenuList(jid) {
    try {
        await sock.sendMessage(jid, {
            title: '💸 MENU DE OPÇÕES DE PIX', text: '💸 MENU DE OPÇÕES DE PIX',
            footer: 'Escolha o valor da recarga:', buttonText: '💳 Ver Valores',
            sections: [
                {
                    title: '💰 VALORES DISPONÍVEIS',
                    rows: [
                        { title: '💵 PIX R$ 5,00', rowId: 'pix_5', description: 'Recarga mínima' },
                        { title: '💵 PIX R$ 8,00', rowId: 'pix_8', description: 'Recarga popular' },
                        { title: '💵 PIX R$ 20,00', rowId: 'pix_20', description: 'Melhor valor' },
                        { title: '✍️ Digite outro valor', rowId: 'pix_custom', description: 'Valor personalizado' }
                    ]
                },
                { title: '🔙 VOLTAR', rows: [{ title: '🔙 Menu Inicial', rowId: 'menu_back', description: 'Voltar' }] }
            ]
        });
    } catch (error) {
        await sock.sendMessage(jid, { text: '*💸 MENU PIX*\n\n1. PIX R$ 5,00\n2. PIX R$ 8,00\n3. PIX R$ 20,00\n4. Digite outro valor' });
    }
}

async function sendCatalogList(jid, page = 1) {
    try {
        const products = await ProductService.getAvailableProducts();
        const totalProducts = products.length;
        const productsPerPage = 10;
        const totalPages = Math.ceil(totalProducts / productsPerPage);

        if (totalProducts === 0) {
            await sock.sendMessage(jid, { text: '📦 Nenhum produto disponível no momento.' });
            return;
        }

        const start = (page - 1) * productsPerPage;
        const end = start + productsPerPage;
        const pageProducts = products.slice(start, end);

        catalogPage[jid] = page;

        const sections = [{
            title: `📦 CATÁLOGO (Página ${page}/${totalPages})`,
            rows: pageProducts.map(p => ({
                title: p.name,
                rowId: `product_${p.id}`,
                description: `💰 R$ ${p.price.toFixed(2)} | 📦 ${p.stock} unid.`
            }))
        }];

        const navRows = [];
        if (page > 1) {
            navRows.push({ title: '⬅️ Página Anterior', rowId: `catalog_page_${page - 1}`, description: `Voltar para página ${page - 1}` });
        }
        if (page < totalPages) {
            navRows.push({ title: '📄 Mostrar Mais Produtos', rowId: `catalog_page_${page + 1}`, description: `Ver página ${page + 1} de ${totalPages}` });
        }
        if (navRows.length > 0) {
            sections.push({ title: '📄 NAVEGAÇÃO', rows: navRows });
        }

        sections.push({ title: '🔙 VOLTAR', rows: [{ title: '🔙 Menu Inicial', rowId: 'menu_back', description: 'Voltar' }] });

        await sock.sendMessage(jid, {
            title: '🛍️ Assinaturas Premium',
            text: `🛍️ *ASSINATURAS PREMIUM*\n\n📄 Página ${page} de ${totalPages}\n📦 Total: ${totalProducts} produtos`,
            footer: 'Escolha um produto abaixo:', buttonText: '📦 Ver Produtos', sections: sections
        });

    } catch (error) {
        await sock.sendMessage(jid, { text: 'Erro ao carregar catálogo.' });
    }
}

async function sendAffiliateList(jid) {
    try {
        await sock.sendMessage(jid, {
            title: '💼 Área do Associado', text: '💼 Área do Associado',
            footer: 'Escolha uma opção:', buttonText: '💼 Opções',
            sections: [
                {
                    title: '📢 OPÇÕES',
                    rows: [
                        { title: '📢 Texto Modelo', rowId: 'affiliate_text', description: 'Mensagem para divulgação' },
                        { title: '💰 Sacar Comissão', rowId: 'affiliate_withdraw', description: 'Transferir para saldo' }
                    ]
                },
                { title: '🔙 VOLTAR', rows: [{ title: '🔙 Menu Inicial', rowId: 'menu_back', description: 'Voltar' }] }
            ]
        });
    } catch (error) {
        await sock.sendMessage(jid, { text: '*💼 ÁREA DO ASSOCIADO*\n\n1. 📢 Texto Modelo\n2. 💰 Sacar Comissão' });
    }
}

// ============ TRATAMENTO DE ERROS ============

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

module.exports = {
    getInstance: () => ({ isConnected: () => sock?.user ? true : false })
};

console.clear();
console.log('🐕 DOGUINHA STORE BOT v3.0');
console.log('===========================');
console.log('✅ 100% COMPLETO');
console.log('📱 Pareamento por código');
console.log('🚀 Pronto para Render\n');

startBot().catch(console.error);
