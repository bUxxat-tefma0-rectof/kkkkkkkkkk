🤔 ENTENDI AGORA!

Se o WhatsApp do seu iPhone não mostra código nenhum quando você vai em "Conectar um aparelho", é porque:

---

📱 NO iPHONE, O WHATSAPP TEM 2 TELAS:

Tela 1: Scanner QR Code (padrão)

· Abre a câmera para escanear QR Code
· NÃO mostra código

Tela 2: Conectar com código

· Você precisa tocar no texto azul "Conectar com código"
· Aí VOCÊ digita um código (não gera)

---

🎯 ENTÃO SEU iPHONE:

Se não aparece código quando toca em "Conectar com código", e sim pede para VOCÊ digitar, então o fluxo no iPhone é:

iPhone pede que VOCÊ digite um código → O código tem que vir de fora

---

✅ SOLUÇÃO FINAL:

Vou fazer o BOT GERAR o código de pareamento e mostrar nos logs do Render. Aí você copia dos logs e digita no iPhone.

---

📁 ATUALIZE O src/index.js NO GITHUB:

Delete tudo e cole isso:

```javascript
require('dotenv').config();

const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    generateRegistrationId
} = require('@whiskeysockets/baileys');

const pino = require('pino');
const fs = require('fs');
const path = require('path');
const KeepAliveServer = require('./server');

const UserService = require('./services/userService');
const PixService = require('./services/pixService');
const ProductService = require('./services/productService');
const PurchaseService = require('./services/purchaseService');
const MessageService = require('./services/messageService');
const AdminService = require('./services/adminService');
const ReferralService = require('./services/referralService');
const ConfigService = require('./services/configService');
const { initializeDatabase } = require('./database/init');
const config = require('./config/settings');

const logger = pino({ level: 'silent' });

let sock = null;
let server = null;
let userSelectedProduct = {};
let catalogPage = {};

function ensureDirectories() {
    ['auth', 'logs', 'backups', 'database', 'tmp'].forEach(dir => {
        const p = path.join(__dirname, '..', dir);
        if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
    });
}

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
            mobile: false,
            syncFullHistory: false,
        });

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;

            if (connection === 'connecting') {
                console.log('🔄 Conectando ao WhatsApp...');
                
                // TENTAR GERAR CÓDIGO DE PARECAMENTO
                if (!sock.authState.creds.registered && !sock.authState.creds.me) {
                    setTimeout(async () => {
                        try {
                            console.log('\n📱 GERANDO CÓDIGO DE PARECAMENTO...\n');
                            
                            // Solicitar código de pareamento
                            const code = await sock.requestPairingCode();
                            
                            console.log('==========================================');
                            console.log('🔢 CÓDIGO DE PARECAMENTO GERADO:');
                            console.log(`   ${code}`);
                            console.log('==========================================');
                            console.log('');
                            console.log('📱 NO SEU iPHONE:');
                            console.log('1. Abra o WhatsApp');
                            console.log('2. Ajustes > Aparelhos Conectados');
                            console.log('3. Toque em "Conectar um aparelho"');
                            console.log('4. Toque em "Conectar com código"');
                            console.log('5. DIGITE O CÓDIGO ACIMA');
                            console.log('==========================================\n');
                            
                        } catch (err) {
                            console.log('\n❌ Não foi possível gerar código.');
                            console.log('📱 Use o QR Code como alternativa:\n');
                            
                            if (qr) {
                                const qrcode = require('qrcode-terminal');
                                qrcode.generate(qr, { small: true });
                            }
                        }
                    }, 3000);
                }
            }

            // Mostrar QR Code se disponível
            if (qr && !sock.authState.creds.registered) {
                console.log('\n📱 QR CODE DISPONÍVEL (alternativa):\n');
                const qrcode = require('qrcode-terminal');
                qrcode.generate(qr, { small: true });
                console.log('\nEscaneie com iPhone: Ajustes > Aparelhos Conectados\n');
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
        setTimeout(() => startBot(), 10000);
    }
}

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
        else if (text === 'admin' || text === 'adm') {
            if (!isAdmin) {
                await sock.sendMessage(jid, { text: '❌ Acesso negado! Apenas administradores.' });
                return;
            }
            const stats = await AdminService.getDashboardStats();
            await sock.sendMessage(jid, { text: MessageService.adminPanel(stats) });
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

async function showMainMenu(jid, user) {
    const balance = await UserService.getBalance(user.id);
    user.balance = balance;
    
    let welcomeMsg = await ConfigService.get('welcome_message');
    welcomeMsg = welcomeMsg.replace('{number}', user.phone_number);
    welcomeMsg = welcomeMsg.replace('{balance}', balance.toFixed(2));
    
    const telegram = await ConfigService.get('telegram_support');
    welcomeMsg += `\n\n📧 *Suporte:* ${telegram}`;
    
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
        
        const msg = `💳 *PAGAMENTO PIX*\n\n` +
                   `💰 Valor: R$ ${amount.toFixed(2)}\n` +
                   `🆔 ID: ${pixData.pixId}\n` +
                   `⏰ Expira em: ${pixExpiration} min\n\n` +
                   `📋 *CÓDIGO COPIA E COLA:*\n\`\`\`${pixData.copyPaste}\`\`\`\n\n✅ Confirmação automática!`;
        
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
                    await sock.sendMessage(jid, { text: `✅ *PAGO!*\n💰 Saldo: R$ ${newBalance.toFixed(2)}` });
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

async function handlePurchaseRequest(jid, user, productId) {
    const balance = await UserService.getBalance(user.id);
    const product = await ProductService.getProductById(productId);

    if (!product) { await sock.sendMessage(jid, { text: '❌ Produto não encontrado!' }); return; }
    if (product.stock <= 0) { await sock.sendMessage(jid, { text: `❌ ${product.name} esgotado!` }); return; }
    if (balance < product.price) {
        await sock.sendMessage(jid, { text: `❌ Saldo insuficiente! Falta R$ ${(product.price - balance).toFixed(2)}` });
        return;
    }

    userSelectedProduct[user.id] = productId;
    await sock.sendMessage(jid, { text: `🛒 *${product.name}*\n💰 R$ ${product.price.toFixed(2)}\n\nDigite *confirmar* ou *cancelar*` });
}

async function confirmPurchase(jid, user) {
    const productId = userSelectedProduct[user.id];
    if (!productId) { await sock.sendMessage(jid, { text: '❌ Nenhum produto!' }); return; }

    const result = await PurchaseService.processPurchase(user.id, productId);

    if (result.success) {
        await sock.sendMessage(jid, {
            text: `✅ *COMPRA REALIZADA!*\n\n📦 ${result.product.name}\n💰 R$ ${result.product.price.toFixed(2)}\n\n🔐 Login: \`${result.credentials.login}\`\n🔑 Senha: \`${result.credentials.password}\`\n📅 Vence: ${result.credentials.expirationDate.toLocaleDateString('pt-BR')}`
        });
        delete userSelectedProduct[user.id];
    } else {
        await sock.sendMessage(jid, { text: `❌ ${result.message}` });
    }
}

async function handleAdminCommand(jid, user, text) {
    const parts = text.split(' ');
    const cmd = parts[0].toLowerCase();

    if (cmd === '/broadcast') {
        const message = parts.slice(1).join(' ');
        if (!message) { await sock.sendMessage(jid, { text: '❌ Use: /broadcast MENSAGEM' }); return; }
        const result = await AdminService.broadcastMessage(message, sock);
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
    else if (cmd === '/dashboard') {
        const stats = await AdminService.getDashboardStats();
        await sock.sendMessage(jid, { text: `📊 *DASHBOARD*\n👥 Usuários: ${stats.totalUsers || 0}\n💰 Faturamento: R$ ${(stats.totalRevenue || 0).toFixed(2)}` });
    }
    else if (cmd === '/ajuda') {
        await sock.sendMessage(jid, { text: `📚 /addproduto | /removerproduto | /dashboard | /broadcast | /usuarios | /comissao | /telegram | /mercadopago` });
    }
}

async function sendMainMenuList(jid) {
    try {
        await sock.sendMessage(jid, {
            title: '🐕 DOGUINHA STORE', text: '🐕 DOGUINHA STORE',
            footer: 'Escolha uma opção:', buttonText: '📱 Ver Opções',
            sections: [{
                title: '📋 MENU PRINCIPAL',
                rows: [
                    { title: '💸 Adicionar Saldo', rowId: 'menu_add_balance', description: 'Recarregue via PIX' },
                    { title: '🛍️ Assinaturas Premium', rowId: 'menu_products', description: 'Veja nosso catálogo' },
                    { title: '💼 Área do Associado', rowId: 'menu_affiliate', description: 'Indique e ganhe' },
                    { title: '👤 Contato do Suporte', rowId: 'menu_support', description: 'Fale conosco' }
                ]
            }]
        });
    } catch (e) {
        await sock.sendMessage(jid, { text: '*🐕 DOGUINHA STORE*\n\n1. 💸 Adicionar Saldo\n2. 🛍️ Assinaturas\n3. 💼 Associado\n4. 👤 Suporte' });
    }
}

async function sendPixMenuList(jid) {
    try {
        await sock.sendMessage(jid, {
            title: '💸 MENU PIX', text: '💸 MENU PIX',
            footer: 'Escolha o valor:', buttonText: '💳 Ver Valores',
            sections: [{
                title: '💰 VALORES',
                rows: [
                    { title: '💵 PIX R$ 5,00', rowId: 'pix_5', description: 'Mínimo' },
                    { title: '💵 PIX R$ 8,00', rowId: 'pix_8', description: 'Popular' },
                    { title: '💵 PIX R$ 20,00', rowId: 'pix_20', description: 'Melhor' },
                    { title: '✍️ Digite outro valor', rowId: 'pix_custom', description: 'Personalizado' }
                ]
            }]
        });
    } catch (e) {
        await sock.sendMessage(jid, { text: '*💸 PIX*\n1. R$ 5\n2. R$ 8\n3. R$ 20\n4. Outro valor' });
    }
}

async function sendCatalogList(jid, page = 1) {
    try {
        const products = await ProductService.getAvailableProducts();
        if (products.length === 0) {
            await sock.sendMessage(jid, { text: '📦 Nenhum produto disponível.' });
            return;
        }

        const perPage = 10;
        const totalPages = Math.ceil(products.length / perPage);
        const start = (page - 1) * perPage;
        const pageProducts = products.slice(start, start + perPage);

        const sections = [{
            title: `📦 Página ${page}/${totalPages}`,
            rows: pageProducts.map(p => ({
                title: p.name,
                rowId: `product_${p.id}`,
                description: `💰 R$ ${p.price.toFixed(2)} | 📦 ${p.stock}`
            }))
        }];

        if (page < totalPages) {
            sections.push({
                title: '📄 MAIS',
                rows: [{ title: '📄 Mostrar Mais', rowId: `catalog_page_${page + 1}`, description: `Página ${page + 1}` }]
            });
        }

        await sock.sendMessage(jid, {
            title: '🛍️ Catálogo', text: `🛍️ *Catálogo*\n📄 ${page}/${totalPages}`,
            footer: 'Escolha um produto:', buttonText: '📦 Ver', sections: sections
        });
    } catch (e) {
        await sock.sendMessage(jid, { text: 'Erro ao carregar.' });
    }
}

async function sendAffiliateList(jid) {
    try {
        await sock.sendMessage(jid, {
            title: '💼 Associado', text: '💼 Associado',
            footer: 'Escolha:', buttonText: '💼 Opções',
            sections: [{
                title: '📢 OPÇÕES',
                rows: [
                    { title: '📢 Texto Modelo', rowId: 'affiliate_text', description: 'Divulgação' },
                    { title: '💰 Sacar Comissão', rowId: 'affiliate_withdraw', description: 'Transferir' }
                ]
            }]
        });
    } catch (e) {
        await sock.sendMessage(jid, { text: '*💼 ASSOCIADO*\n1. Texto Modelo\n2. Sacar' });
    }
}

process.on('uncaughtException', (e) => console.error('❌', e.message));
process.on('unhandledRejection', (e) => console.error('❌', e));

module.exports = { getInstance: () => ({ isConnected: () => sock?.user ? true : false }) };

console.clear();
console.log('🐕 DOGUINHA STORE BOT');
console.log('=====================\n');
startBot().catch(console.error);
```

---

🎯 AGORA VAI:

1. Atualize o GitHub com esse código
2. Render faz deploy
3. Nos logs vai aparecer: "🔢 CÓDIGO DE PARECAMENTO GERADO: XXXXXXXX"
4. Pegue esse código
5. No iPhone: WhatsApp > Ajustes > Aparelhos Conectados > Conectar com código
6. DIGITE O CÓDIGO
7. ✅ Conectado!

O BOT vai gerar o código e mostrar nos logs! 🐕
