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

// Serviços
const UserService = require('./services/userService');
const PixService = require('./services/pixService');
const ProductService = require('./services/productService');
const PurchaseService = require('./services/purchaseService');
const MessageService = require('./services/messageService');
const AdminService = require('./services/adminService');
const ReferralService = require('./services/referralService');
const { initializeDatabase } = require('./database/init');

// Config
const config = require('./config/settings');

// Logger silencioso
const logger = pino({ level: 'silent' });

// Variáveis globais
let sock = null;
let server = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;

// Criar pastas necessárias
function ensureDirectories() {
    const dirs = ['auth', 'logs', 'backups', 'database', 'tmp'];
    dirs.forEach(dir => {
        const dirPath = path.join(__dirname, '..', dir);
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
        }
    });
}

// Perguntar no terminal
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
        ensureDirectories();
        
        // Inicializar banco de dados
        console.log('📦 Inicializando banco de dados...');
        await initializeDatabase();
        console.log('✅ Banco de dados pronto!\n');

        // Iniciar servidor web (PARA RENDER NÃO DORMIR)
        if (!server) {
            server = new KeepAliveServer();
            await server.start();
            console.log('');
        }

        // Carregar estado de autenticação
        const { state, saveCreds } = await useMultiFileAuthState(
            path.join(__dirname, '..', 'auth')
        );
        
        // Buscar versão mais recente
        const { version } = await fetchLatestBaileysVersion();
        console.log(`📱 WhatsApp Web v${version.join('.')}\n`);
        
        // Criar socket
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

        // Salvar credenciais
        sock.ev.on('creds.update', saveCreds);

        // Eventos de conexão
        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;
            
            if (connection === 'connecting') {
                console.log('🔄 Conectando ao WhatsApp...');
                
                // Pedir código de pareamento após 3 segundos
                if (!sock.authState.creds.registered) {
                    setTimeout(async () => {
                        console.log('\n📱 ========== PARECAMENTO POR CÓDIGO ==========');
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
                                console.log('\n❌ Código inválido! Reinicie o bot.');
                                console.log('   Use: npm start\n');
                            }
                        } else {
                            console.log('\n❌ Código deve ter 8 dígitos!');
                            console.log('   Reinicie o bot com: npm start\n');
                        }
                    }, 3000);
                }
            }

            if (connection === 'open') {
                reconnectAttempts = 0;
                console.log('\n✅ BOT CONECTADO COM SUCESSO!');
                console.log(`🤖 ${config.bot.name}`);
                console.log(`📱 Número: ${sock.user.id.split(':')[0]}`);
                console.log('\n🚀 Aguardando mensagens...\n');
            }

            if (connection === 'close') {
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                
                console.log(`\n🔌 Conexão fechada (código ${statusCode})`);
                
                // Reconectar se não for logout
                if (statusCode !== DisconnectReason.loggedOut && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
                    reconnectAttempts++;
                    const delay = Math.min(5000 * reconnectAttempts, 60000);
                    console.log(`🔄 Tentativa ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS} em ${delay/1000}s...\n`);
                    
                    setTimeout(() => {
                        startBot();
                    }, delay);
                } else {
                    console.log('\n❌ Sessão expirada ou muitas tentativas.');
                    console.log('📝 Delete a pasta "auth" e reinicie.\n');
                }
            }
        });

        // Processar mensagens
        sock.ev.on('messages.upsert', async (m) => {
            const message = m.messages[0];
            
            if (!message.message) return;
            if (message.key.fromMe) return;
            
            const jid = message.key.remoteJid;
            if (jid.includes('@g.us') || jid === 'status@broadcast') return;
            
            await processMessage(message, jid);
        });

    } catch (error) {
        console.error('❌ Erro ao iniciar:', error.message);
        
        if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
            reconnectAttempts++;
            console.log(`🔄 Tentando novamente em 10 segundos...\n`);
            setTimeout(startBot, 10000);
        }
    }
}

// Processar mensagem
async function processMessage(msg, jid) {
    try {
        const phoneNumber = jid.replace('@s.whatsapp.net', '');
        
        // Extrair texto
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

        // Buscar usuário
        const user = await UserService.getOrCreateUser(phoneNumber);

        // Comandos admin de broadcast
        const isAdmin = await AdminService.isAdmin(phoneNumber);
        if (isAdmin && text.startsWith('/broadcast ')) {
            const broadcastMsg = text.replace('/broadcast ', '');
            await handleBroadcast(jid, broadcastMsg);
            return;
        }
        
        if (isAdmin && text.startsWith('/addproduct ')) {
            await handleAddProduct(jid, text.replace('/addproduct ', ''));
            return;
        }

        // MENU PRINCIPAL
        if (['oi', 'olá', 'ola', 'menu', 'inicio', 'início', 'start'].includes(text.toLowerCase())) {
            await sendMainMenu(jid, user);
        }
        // ADICIONAR SALDO
        else if (text === 'menu_add_balance' || text === '1') {
            await sendPixMenu(jid);
        }
        // ASSINATURAS
        else if (text === 'menu_products' || text === '2') {
            await sendCatalog(jid, user);
        }
        // AFILIADO
        else if (text === 'menu_affiliate' || text === '3') {
            await sendAffiliateArea(jid, user);
        }
        // SUPORTE
        else if (text === 'menu_support' || text === '4') {
            await sendSupport(jid);
        }
        // PIX FIXO
        else if (text === 'pix_5') await processPix(jid, user, 5);
        else if (text === 'pix_8') await processPix(jid, user, 8);
        else if (text === 'pix_20') await processPix(jid, user, 20);
        // PIX CUSTOM
        else if (text === 'pix_custom') {
            await sendMessage(jid, '💎 *Digite o valor desejado:*\n\n_Exemplo: 50 (para R$ 50,00)_\n_Mínimo: R$ 5,00_');
        }
        // VALOR NUMÉRICO
        else if (!isNaN(text) && parseFloat(text) >= 5) {
            await processPix(jid, user, parseFloat(text));
        }
        // VOLTAR
        else if (text === 'menu_back') {
            await sendMainMenu(jid, user);
        }
        // COMPRAR PRODUTO
        else if (text.startsWith('product_')) {
            const productId = parseInt(text.replace('product_', ''));
            await handlePurchase(jid, user, productId);
        }
        // CONFIRMAR COMPRA
        else if (text === 'confirm_purchase') {
            await confirmPurchase(jid, user);
        }
        // CANCELAR COMPRA
        else if (text === 'cancel_purchase') {
            await sendMessage(jid, '❌ Compra cancelada.');
            await sendMainMenu(jid, user);
        }
        // ADMIN
        else if (text === 'admin' || text === 'adm') {
            await sendAdminPanel(jid, user);
        }
        // TEXTO MODELO
        else if (text === 'affiliate_text') {
            await sendReferralText(jid, user);
        }
        // SACAR COMISSÃO
        else if (text === 'affiliate_withdraw') {
            await handleWithdraw(jid, user);
        }
        // DEFAULT - Menu
        else {
            await sendMainMenu(jid, user);
        }

    } catch (error) {
        console.error('Erro ao processar:', error);
        await sendMessage(jid, '❌ Erro! Digite *menu* para recomeçar.');
    }
}

// ============ FUNÇÕES DE ENVIO ============

async function sendMessage(jid, text) {
    try {
        await sock.sendMessage(jid, { text });
    } catch (error) {
        console.error('Erro ao enviar:', error);
    }
}

async function sendInteractiveList(jid, title, buttonText, sections) {
    try {
        await sock.sendMessage(jid, {
            title: title,
            text: title,
            footer: 'Escolha uma opção:',
            buttonText: buttonText,
            sections: sections
        });
    } catch (error) {
        console.error('Erro lista interativa:', error);
    }
}

// ============ MENUS ============

async function sendMainMenu(jid, user) {
    const balance = await UserService.getBalance(user.id);
    
    const msg = `🐕 *DOGUINHA STORE*\n\n` +
               `Bem-vindo(a) à melhor loja de assinaturas!\n\n` +
               `📱 *Seu número:* ${user.phone_number}\n` +
               `💰 *Saldo:* R$ ${balance.toFixed(2)}\n` +
               `📧 *Suporte Telegram:* ${config.support.telegram}\n\n` +
               `Escolha uma opção abaixo:`;
    
    await sendMessage(jid, msg);
    
    const sections = [{
        title: '📋 MENU PRINCIPAL',
        rows: [
            { title: '💸 Adicionar Saldo', rowId: 'menu_add_balance', description: 'Recarregue via PIX' },
            { title: '🛍️ Assinaturas Premium', rowId: 'menu_products', description: 'Veja nosso catálogo' },
            { title: '💼 Área do Associado', rowId: 'menu_affiliate', description: 'Indique e ganhe comissões' },
            { title: '👤 Contato do Suporte', rowId: 'menu_support', description: 'Fale conosco' }
        ]
    }];
    
    await sendInteractiveList(jid, '🐕 DOGUINHA STORE', '📱 Ver Opções', sections);
}

async function sendPixMenu(jid) {
    await sendMessage(jid, '💸 *MENU DE OPÇÕES DE PIX*\n\nEscolha o valor da recarga:');
    
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
            { title: '🔙 Menu Inicial', rowId: 'menu_back', description: 'Voltar ao menu' }
        ]
    }];
    
    await sendInteractiveList(jid, '💸 Opções PIX', '💳 Ver Valores', sections);
}

async function sendCatalog(jid, user) {
    const balance = await UserService.getBalance(user.id);
    const products = await ProductService.getAvailableProducts();
    
    const header = `🛍️ *ASSINATURAS PREMIUM*\n\n` +
                  `👤 *Cliente:* ${user.phone_number}\n` +
                  `💰 *Saldo:* R$ ${balance.toFixed(2)}\n` +
                  `👥 *Grupo:* Clientes VIP\n\n` +
                  `📦 *Produtos disponíveis:*`;
    
    await sendMessage(jid, header);
    
    if (products.length === 0) {
        await sendMessage(jid, '❌ Nenhum produto disponível no momento.');
        return;
    }
    
    const sections = [];
    let currentSection = { title: '📦 CATÁLOGO', rows: [] };
    
    products.forEach((product, index) => {
        if (index > 0 && index % 10 === 0) {
            sections.push(currentSection);
            currentSection = { 
                title: `📦 CATÁLOGO (Parte ${Math.floor(index/10) + 2})`, 
                rows: [] 
            };
        }
        
        currentSection.rows.push({
            title: product.name,
            rowId: `product_${product.id}`,
            description: `💰 R$ ${product.price.toFixed(2)} | 📦 ${product.stock} unid.`
        });
    });
    sections.push(currentSection);
    
    await sendInteractiveList(jid, '🛍️ Assinaturas', '📦 Ver Produtos', sections);
}

async function sendAffiliateArea(jid, user) {
    const stats = await ReferralService.getReferralStats(user.id);
    
    const msg = `💼 *ÁREA DO ASSOCIADO*\n\n` +
               `🔗 *Link de Indicação:*\n${user.referral_link || 'Gerando...'}\n\n` +
               `📝 *Código:* \`${user.referral_code}\`\n\n` +
               `💰 *Saldo Comissão:* R$ ${(user.commission_balance || 0).toFixed(2)}\n` +
               `👥 *Indicados:* ${stats.total_referrals || 0}\n` +
               `📊 *Comissão:* ${config.commission.percentage}%`;
    
    await sendMessage(jid, msg);
    
    const sections = [{
        title: '📢 OPÇÕES',
        rows: [
            { title: '📢 Texto Modelo', rowId: 'affiliate_text', description: 'Mensagem pronta para divulgar' },
            { title: '💰 Sacar Comissão', rowId: 'affiliate_withdraw', description: 'Transferir para saldo' }
        ]
    }, {
        title: '🔙 VOLTAR',
        rows: [{ title: '🔙 Menu Inicial', rowId: 'menu_back', description: 'Voltar' }]
    }];
    
    await sendInteractiveList(jid, '💼 Área do Associado', '💼 Opções', sections);
}

async function sendSupport(jid) {
    const msg = `👤 *CONTATO DO SUPORTE*\n\n` +
               `📱 *Telegram:* ${config.support.telegram}\n` +
               `🔗 *Link:* https://t.me/${config.support.telegram.replace('@', '')}\n\n` +
               `⏰ *Horário:*\n` +
               `📅 Seg a Sex: 09h às 18h\n` +
               `📅 Sáb: 09h às 13h\n` +
               `📅 Dom: Fechado\n\n` +
               `ℹ️ Atendimento apenas via Telegram`;
    
    await sendMessage(jid, msg);
}

async function sendAdminPanel(jid, user) {
    const isAdmin = await AdminService.isAdmin(user.phone_number);
    
    if (!isAdmin) {
        await sendMessage(jid, '❌ Acesso negado! Apenas administradores.');
        return;
    }
    
    const stats = await AdminService.getDashboardStats();
    
    const msg = `👑 *PAINEL ADMINISTRATIVO*\n\n` +
               `📊 *ESTATÍSTICAS:*\n` +
               `👥 Usuários: ${stats.totalUsers || 0}\n` +
               `🛍️ Vendas hoje: ${stats.todaySales || 0}\n` +
               `💰 Faturamento: R$ ${(stats.totalRevenue || 0).toFixed(2)}\n` +
               `💳 Recargas: ${stats.totalRecharges || 0}\n\n` +
               `📦 *COMANDOS:*\n` +
               `📢 \`/broadcast mensagem\` - Enviar para todos\n` +
               `➕ \`/addproduct Nome|Preço|Estoque|Categoria\` - Adicionar produto\n` +
               `📊 \`admin\` - Ver este painel`;
    
    await sendMessage(jid, msg);
}

// ============ PIX ============

async function processPix(jid, user, amount) {
    try {
        if (amount < 5) {
            await sendMessage(jid, '❌ Valor mínimo: R$ 5,00');
            return;
        }
        
        await sendMessage(jid, '⏳ *Gerando PIX...*');
        
        const pixData = await PixService.generatePix(user.id, amount);
        
        const msg = `💳 *PAGAMENTO PIX*\n\n` +
                   `💰 *Valor:* R$ ${amount.toFixed(2)}\n` +
                   `🆔 *ID:* ${pixData.pixId}\n` +
                   `⏰ *Vencimento:* ${new Date(Date.now() + config.pix.expirationMinutes * 60000).toLocaleString('pt-BR')}\n\n` +
                   `📋 *CÓDIGO COPIA E COLA:*\n` +
                   `\`\`\`${pixData.copyPaste}\`\`\`\n\n` +
                   `⚠️ Expira em ${config.pix.expirationMinutes} minutos\n` +
                   `✅ Confirmação automática!`;
        
        await sendMessage(jid, msg);
        
        // Verificar pagamento
        let checkCount = 0;
        const maxChecks = (config.pix.expirationMinutes * 60) / 10;
        
        const checkInterval = setInterval(async () => {
            checkCount++;
            
            try {
                const result = await PixService.checkPaymentStatus(pixData.pixId);
                
                if (result.status === 'approved') {
                    clearInterval(checkInterval);
                    const newBalance = await UserService.getBalance(user.id);
                    await sendMessage(jid,
                        `✅ *PAGAMENTO APROVADO!*\n\n` +
                        `💸 Recarga: R$ ${amount.toFixed(2)}\n` +
                        `💰 Novo saldo: R$ ${newBalance.toFixed(2)}\n\n` +
                        `🛍️ Use *menu* para comprar!`
                    );
                } else if (result.status === 'rejected') {
                    clearInterval(checkInterval);
                    await sendMessage(jid, '❌ Pagamento rejeitado. Tente novamente.');
                } else if (checkCount >= maxChecks) {
                    clearInterval(checkInterval);
                    await sendMessage(jid, '⏰ PIX expirado. Gere um novo.');
                }
            } catch (error) {
                if (checkCount >= maxChecks) clearInterval(checkInterval);
            }
        }, 10000);
        
    } catch (error) {
        await sendMessage(jid, `❌ Erro: ${error.message}`);
    }
}

// ============ COMPRA ============

let userSelectedProduct = {};

async function handlePurchase(jid, user, productId) {
    const balance = await UserService.getBalance(user.id);
    const product = await ProductService.getProductById(productId);
    
    if (!product) {
        await sendMessage(jid, '❌ Produto não encontrado!');
        return;
    }
    
    if (product.stock <= 0) {
        await sendMessage(jid, `❌ *${product.name}* esgotado!`);
        return;
    }
    
    if (balance < product.price) {
        await sendMessage(jid,
            `❌ *SALDO INSUFICIENTE*\n\n` +
            `💰 Seu saldo: R$ ${balance.toFixed(2)}\n` +
            `💵 Preço: R$ ${product.price.toFixed(2)}\n` +
            `📉 Falta: R$ ${(product.price - balance).toFixed(2)}\n\n` +
            `💸 Faça uma recarga primeiro!`
        );
        return;
    }
    
    userSelectedProduct[user.id] = productId;
    
    await sendMessage(jid,
        `🛒 *CONFIRMAR COMPRA*\n\n` +
        `📦 Produto: ${product.name}\n` +
        `💰 Valor: R$ ${product.price.toFixed(2)}\n` +
        `📦 Estoque: ${product.stock} unid.\n\n` +
        `✅ Digite *confirmar* para comprar\n` +
        `❌ Digite *cancelar* para desistir`
    );
}

async function confirmPurchase(jid, user) {
    const productId = userSelectedProduct[user.id];
    
    if (!productId) {
        await sendMessage(jid, '❌ Nenhum produto selecionado!');
        return;
    }
    
    const result = await PurchaseService.processPurchase(user.id, productId);
    
    if (result.success) {
        const creds = result.credentials;
        await sendMessage(jid,
            `✅ *COMPRA REALIZADA!*\n\n` +
            `📦 ${result.product.name}\n` +
            `💰 R$ ${result.product.price.toFixed(2)}\n\n` +
            `🔐 *DADOS DE ACESSO:*\n` +
            `📧 Login: \`${creds.login}\`\n` +
            `🔑 Senha: \`${creds.password}\`\n` +
            `🔗 Link: ${creds.accessLink}\n` +
            `📅 Vence: ${creds.expirationDate.toLocaleDateString('pt-BR')}\n\n` +
            `⚠️ *Guarde esses dados!*`
        );
        
        delete userSelectedProduct[user.id];
    } else {
        await sendMessage(jid, `❌ ${result.message}`);
    }
}

// ============ AFILIADO ============

async function sendReferralText(jid, user) {
    const botNumber = sock.user?.id?.split(':')[0] || 'SEU_NUMERO';
    
    const msg = `🐕 *DOGUINHA STORE*\n\n` +
               `🎉 Assinaturas Premium com os melhores preços!\n\n` +
               `📱 *Chame o bot:* +${botNumber}\n` +
               `🔗 *Link:* ${user.referral_link}\n` +
               `📝 *Código:* \`${user.referral_code}\`\n\n` +
               `✨ Use meu código e ganhe benefícios!`;
    
    await sendMessage(jid, msg);
}

async function handleWithdraw(jid, user) {
    const stats = await ReferralService.getReferralStats(user.id);
    const commissionBalance = user.commission_balance || 0;
    
    if (commissionBalance <= 0) {
        await sendMessage(jid, '❌ Você não possui comissões para sacar!');
        return;
    }
    
    const result = await ReferralService.withdrawCommission(user.id, commissionBalance);
    
    if (result.success) {
        const newBalance = await UserService.getBalance(user.id);
        await sendMessage(jid,
            `✅ *COMISSÃO SACADA!*\n\n` +
            `💰 Valor: R$ ${commissionBalance.toFixed(2)}\n` +
            `💵 Saldo total: R$ ${newBalance.toFixed(2)}`
        );
    }
}

// ============ ADMIN ============

async function handleBroadcast(jid, message) {
    const phoneNumber = jid.replace('@s.whatsapp.net', '');
    const isAdmin = await AdminService.isAdmin(phoneNumber);
    
    if (!isAdmin) return;
    
    await sendMessage(jid, '📤 *Iniciando transmissão...*');
    
    const result = await AdminService.broadcastMessage(message, sock);
    
    await sendMessage(jid,
        `✅ *TRANSMISSÃO CONCLUÍDA!*\n\n` +
        `📤 Enviadas: ${result.sent}\n` +
        `❌ Falhas: ${result.failed}\n` +
        `👥 Total: ${result.total}`
    );
}

async function handleAddProduct(jid, data) {
    const phoneNumber = jid.replace('@s.whatsapp.net', '');
    const isAdmin = await AdminService.isAdmin(phoneNumber);
    
    if (!isAdmin) return;
    
    // Formato: Nome|Preço|Estoque|Categoria
    const parts = data.split('|').map(p => p.trim());
    
    if (parts.length < 3) {
        await sendMessage(jid, '❌ Formato: `/addproduct Nome|Preço|Estoque|Categoria`');
        return;
    }
    
    const [name, price, stock, category] = parts;
    
    const product = await ProductService.addProduct({
        name,
        price: parseFloat(price),
        stock: parseInt(stock),
        category: category || 'Geral',
        description: `${name} - Acesso Premium`
    });
    
    await sendMessage(jid,
        `✅ *PRODUTO ADICIONADO!*\n\n` +
        `📦 Nome: ${name}\n` +
        `💰 Preço: R$ ${parseFloat(price).toFixed(2)}\n` +
        `📦 Estoque: ${stock}\n` +
        `🏷️ Categoria: ${category || 'Geral'}\n` +
        `🆔 ID: ${product.id}`
    );
}

// ============ INICIAR ============

// Tratamento de erros global
process.on('uncaughtException', (error) => {
    console.error('❌ Erro crítico:', error.message);
});

process.on('unhandledRejection', (reason) => {
    console.error('❌ Promise rejeitada:', reason);
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Encerrando bot...');
    if (server) server.stop();
    process.exit(0);
});

// Exportar para o servidor
module.exports = {
    getInstance: () => ({ isConnected: () => sock?.user ? true : false })
};

// Iniciar
console.clear();
console.log('🐕 DOGUINHA STORE BOT');
console.log('=====================\n');
startBot().catch(console.error);
