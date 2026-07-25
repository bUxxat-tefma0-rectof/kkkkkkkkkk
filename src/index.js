require('dotenv').config();
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, makeCacheableSignalKeyStore } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
const path = require('path');
const KeepAliveServer = require('./server');
const PairingServer = require('./pairingServer');
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
let pairingServer = null;
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
        if (!server) { server = new KeepAliveServer(); await server.start(); }
        if (!pairingServer) { pairingServer = new PairingServer(); pairingServer.start(3456); }
        
        const { state, saveCreds } = await useMultiFileAuthState(path.join(__dirname, '..', 'auth'));
        const { version } = await fetchLatestBaileysVersion();
        console.log('📱 WhatsApp Web v' + version.join('.') + '\n');

        sock = makeWASocket({
            version, logger, printQRInTerminal: false,
            auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, logger) },
            browser: ['Safari', 'Chrome', '1.0.0'],
        });

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;

            if (connection === 'connecting') {
                console.log('🔄 Conectando ao WhatsApp...');
                
                if (!sock.authState.creds.registered) {
                    console.log('\n📱 ====================================');
                    console.log('   ABRA A PÁGINA DE PARECAMENTO:');
                    console.log('   https://SEU_APP.onrender.com/pair');
                    console.log('   (substitua SEU_APP pelo nome do seu app)');
                    console.log('===================================\n');
                    console.log('⏳ Aguardando código...\n');
                    
                    const code = await pairingServer.waitForCode();
                    
                    if (code) {
                        console.log('📝 Código recebido: ' + code);
                        try {
                            await sock.requestPairingCode(code);
                            console.log('✅ Código enviado para o WhatsApp!');
                            console.log('📱 Confirme no seu iPhone!\n');
                        } catch (e) {
                            console.log('❌ Código inválido: ' + e.message);
                            console.log('🔄 Recarregue a página e tente novamente.\n');
                        }
                    } else {
                        console.log('⏰ Tempo esgotado. Reinicie o deploy.\n');
                    }
                }
            }

            if (connection === 'open') {
                console.log('\n✅ BOT CONECTADO!');
                console.log('📱 Número: ' + sock.user.id.split(':')[0] + '\n');
            }

            if (connection === 'close') {
                const code = lastDisconnect?.error?.output?.statusCode;
                console.log('🔌 Desconectado: ' + code);
                if (code !== DisconnectReason.loggedOut) {
                    console.log('🔄 Reconectando...\n');
                    setTimeout(startBot, 5000);
                }
            }
        });

        sock.ev.on('messages.upsert', async (m) => {
            const msg = m.messages[0];
            if (!msg.message || msg.key.fromMe) return;
            const jid = msg.key.remoteJid;
            if (jid.includes('@g.us')) return;
            
            let text = '';
            if (msg.message.conversation) text = msg.message.conversation;
            else if (msg.message.extendedTextMessage?.text) text = msg.message.extendedTextMessage.text;
            else if (msg.message.listResponseMessage?.singleSelectReply?.selectedRowId) text = msg.message.listResponseMessage.singleSelectReply.selectedRowId;
            if (!text) return;
            text = text.trim();

            const phone = jid.replace('@s.whatsapp.net', '');
            const user = await UserService.getOrCreateUser(phone);
            const isAdmin = await AdminService.isAdmin(phone);

            if (['oi', 'ola', 'olá', 'menu', 'inicio', 'início'].includes(text.toLowerCase())) {
                const bal = await UserService.getBalance(user.id);
                const tel = await ConfigService.get('telegram_support');
                await sock.sendMessage(jid, { text: '🐕 *DOGUINHA STORE*\n\n📱 Número: ' + phone + '\n💰 Saldo: R$ ' + bal.toFixed(2) + '\n📧 Suporte: ' + tel + '\n\nEscolha uma opção:' });
                await sock.sendMessage(jid, {
                    title: '🐕 DOGUINHA STORE', text: '🐕 DOGUINHA STORE', buttonText: '📱 Ver Opções', footer: 'Escolha abaixo:',
                    sections: [{ title: '📋 MENU PRINCIPAL', rows: [
                        { title: '💸 Adicionar Saldo', rowId: 'menu_add_balance', description: 'Recarregue via PIX' },
                        { title: '🛍️ Assinaturas Premium', rowId: 'menu_products', description: 'Veja nosso catálogo' },
                        { title: '💼 Área do Associado', rowId: 'menu_affiliate', description: 'Indique e ganhe comissões' },
                        { title: '👤 Contato do Suporte', rowId: 'menu_support', description: 'Fale conosco' }
                    ]}]
                });
            }
            else if (text === 'menu_add_balance' || text === '1') {
                await sock.sendMessage(jid, { text: '💸 *MENU DE OPÇÕES DE PIX*\n\nEscolha o valor da recarga:' });
                await sock.sendMessage(jid, {
                    title: '💸 MENU PIX', text: '💸 MENU PIX', buttonText: '💳 Ver Valores', footer: 'Escolha:',
                    sections: [{ title: '💰 VALORES', rows: [
                        { title: '💵 PIX R$ 5,00', rowId: 'pix_5', description: 'Recarga mínima' },
                        { title: '💵 PIX R$ 8,00', rowId: 'pix_8', description: 'Recarga popular' },
                        { title: '💵 PIX R$ 20,00', rowId: 'pix_20', description: 'Melhor valor' },
                        { title: '✍️ Digite outro valor', rowId: 'pix_custom', description: 'Valor personalizado' }
                    ]}]
                });
            }
            else if (text === 'menu_products' || text === '2') {
                const bal = await UserService.getBalance(user.id);
                const products = await ProductService.getAvailableProducts();
                await sock.sendMessage(jid, { text: '🛍️ *ASSINATURAS PREMIUM*\n\n👤 Cliente: ' + phone + '\n💰 Saldo: R$ ' + bal.toFixed(2) + '\n👥 Grupo: Clientes VIP\n\n📦 Produtos disponíveis:' });
                if (products.length === 0) {
                    await sock.sendMessage(jid, { text: '📦 Nenhum produto disponível no momento.' });
                } else {
                    const rows = products.slice(0, 10).map(p => ({
                        title: p.name, rowId: 'product_' + p.id,
                        description: '💰 R$ ' + p.price.toFixed(2) + ' | 📦 ' + p.stock + ' unid.'
                    }));
                    await sock.sendMessage(jid, { title: '🛍️ Catálogo', text: '🛍️ Catálogo', buttonText: '📦 Ver Produtos', sections: [{ title: '📦 DISPONÍVEIS', rows }] });
                }
            }
            else if (text === 'menu_affiliate' || text === '3') {
                const stats = await ReferralService.getReferralStats(user.id);
                const pct = await ConfigService.get('commission_percentage');
                await sock.sendMessage(jid, { text: '💼 *ÁREA DO ASSOCIADO*\n\n🔗 Link: ' + (user.referral_link || 'Gerando...') + '\n📝 Código: ' + user.referral_code + '\n\n💰 Comissão: R$ ' + (user.commission_balance || 0).toFixed(2) + '\n👥 Indicados: ' + (stats.total_referrals || 0) + '\n📊 Percentual: ' + pct + '%' });
                await sock.sendMessage(jid, {
                    title: '💼 Associado', text: '💼 Associado', buttonText: '💼 Opções',
                    sections: [{ title: '📢 OPÇÕES', rows: [
                        { title: '📢 Texto Modelo', rowId: 'affiliate_text', description: 'Mensagem para divulgação' },
                        { title: '💰 Sacar Comissão', rowId: 'affiliate_withdraw', description: 'Transferir para saldo' }
                    ]}]
                });
            }
            else if (text === 'menu_support' || text === '4') {
                const tel = await ConfigService.get('telegram_support');
                await sock.sendMessage(jid, { text: '👤 *CONTATO DO SUPORTE*\n\n📱 Telegram: ' + tel + '\n🔗 https://t.me/' + tel.replace('@', '') + '\n\n⏰ Seg-Sex: 09h-18h | Sáb: 09h-13h\n\nℹ️ Atendimento apenas via Telegram' });
            }
            else if (text === 'pix_5') await processPix(jid, user, 5);
            else if (text === 'pix_8') await processPix(jid, user, 8);
            else if (text === 'pix_20') await processPix(jid, user, 20);
            else if (text === 'pix_custom') await sock.sendMessage(jid, { text: '💎 *Digite o valor desejado:*\n\nExemplo: 50 (para R$ 50,00)\nMínimo: R$ 5,00' });
            else if (!isNaN(text) && parseFloat(text) >= 5) await processPix(jid, user, parseFloat(text));
            else if (text === 'menu_back') {
                const bal = await UserService.getBalance(user.id);
                const tel = await ConfigService.get('telegram_support');
                await sock.sendMessage(jid, { text: '🐕 *DOGUINHA STORE*\n\n📱 ' + phone + '\n💰 R$ ' + bal.toFixed(2) + '\n📧 ' + tel });
            }
            else if (text.startsWith('product_')) {
                const pid = parseInt(text.replace('product_', ''));
                const product = await ProductService.getProductById(pid);
                const bal = await UserService.getBalance(user.id);
                if (!product) { await sock.sendMessage(jid, { text: '❌ Produto não encontrado!' }); return; }
                if (product.stock <= 0) { await sock.sendMessage(jid, { text: '❌ ' + product.name + ' esgotado!' }); return; }
                if (bal < product.price) { await sock.sendMessage(jid, { text: '❌ *SALDO INSUFICIENTE*\n\n💰 Seu saldo: R$ ' + bal.toFixed(2) + '\n💵 Preço: R$ ' + product.price.toFixed(2) + '\n📉 Falta: R$ ' + (product.price - bal).toFixed(2) + '\n\n💸 Faça uma recarga primeiro!' }); return; }
                userSelectedProduct[user.id] = pid;
                await sock.sendMessage(jid, { text: '🛒 *CONFIRMAR COMPRA*\n\n📦 Produto: ' + product.name + '\n💰 Valor: R$ ' + product.price.toFixed(2) + '\n📦 Estoque: ' + product.stock + ' unid.\n\nDigite *confirmar* para comprar\nDigite *cancelar* para desistir' });
            }
            else if (text.toLowerCase() === 'confirmar') {
                const pid = userSelectedProduct[user.id];
                if (!pid) { await sock.sendMessage(jid, { text: '❌ Nenhum produto selecionado!' }); return; }
                const result = await PurchaseService.processPurchase(user.id, pid);
                if (result.success) {
                    await sock.sendMessage(jid, { text: '✅ *COMPRA REALIZADA!*\n\n📦 ' + result.product.name + '\n💰 R$ ' + result.product.price.toFixed(2) + '\n\n🔐 *DADOS DE ACESSO:*\n📧 Login: ' + result.credentials.login + '\n🔑 Senha: ' + result.credentials.password + '\n📅 Vence: ' + result.credentials.expirationDate.toLocaleDateString('pt-BR') + '\n\n⚠️ *Guarde esses dados!*' });
                    delete userSelectedProduct[user.id];
                } else {
                    await sock.sendMessage(jid, { text: '❌ ' + result.message });
                }
            }
            else if (text.toLowerCase() === 'cancelar') {
                delete userSelectedProduct[user.id];
                await sock.sendMessage(jid, { text: '❌ Compra cancelada.' });
            }
            else if (text === 'affiliate_text') {
                const botNumber = sock.user?.id?.split(':')[0] || 'SEU_NUMERO';
                await sock.sendMessage(jid, { text: '🐕 *DOGUINHA STORE*\n\n🎉 Assinaturas Premium com os melhores preços!\n\n📱 Chame o bot: +' + botNumber + '\n🔗 Link: ' + user.referral_link + '\n📝 Código: ' + user.referral_code + '\n\n✨ Use meu código e ganhe benefícios!' });
            }
            else if (text === 'affiliate_withdraw') {
                const cb = user.commission_balance || 0;
                if (cb <= 0) { await sock.sendMessage(jid, { text: '❌ Você não possui comissões para sacar!' }); return; }
                await ReferralService.withdrawCommission(user.id, cb);
                const nb = await UserService.getBalance(user.id);
                await sock.sendMessage(jid, { text: '✅ *COMISSÃO SACADA!*\n\n💰 Valor: R$ ' + cb.toFixed(2) + '\n💵 Saldo total: R$ ' + nb.toFixed(2) });
            }
            else if (text === 'admin' && isAdmin) {
                const stats = await AdminService.getDashboardStats();
                await sock.sendMessage(jid, { text: '👑 *PAINEL ADMIN*\n\n👥 Usuários: ' + (stats.totalUsers || 0) + '\n🛍️ Vendas hoje: ' + (stats.todaySales || 0) + '\n💰 Faturamento: R$ ' + ((stats.totalRevenue || 0)).toFixed(2) + '\n💳 Recargas: ' + (stats.totalRecharges || 0) + '\n\n📦 COMANDOS:\n/addproduto Nome|Preço|Estoque|Categoria\n/removerproduto ID\n/broadcast MENSAGEM\n/dashboard\n/usuarios' });
            }
            else if (isAdmin && text.startsWith('/addproduto')) {
                const d = text.replace('/addproduto ', '').split('|').map(s => s.trim());
                if (d.length >= 3) {
                    await AdminService.addProduct({ name: d[0], price: parseFloat(d[1]), stock: parseInt(d[2]), category: d[3] || 'Geral' });
                    await sock.sendMessage(jid, { text: '✅ Produto adicionado!' });
                } else {
                    await sock.sendMessage(jid, { text: '❌ Use: /addproduto Nome|Preço|Estoque|Categoria' });
                }
            }
            else if (isAdmin && text.startsWith('/removerproduto')) {
                const id = parseInt(text.replace('/removerproduto ', ''));
                if (id) { await AdminService.removeProduct(id); await sock.sendMessage(jid, { text: '✅ Produto #' + id + ' removido!' }); }
            }
            else if (isAdmin && text.startsWith('/broadcast')) {
                const m = text.replace('/broadcast ', '');
                const r = await AdminService.broadcastMessage(m, sock);
                await sock.sendMessage(jid, { text: '✅ Transmissão concluída!\n📤 Enviadas: ' + r.sent + '\n❌ Falhas: ' + r.failed + '\n👥 Total: ' + r.total });
            }
            else if (isAdmin && text === '/dashboard') {
                const stats = await AdminService.getDashboardStats();
                await sock.sendMessage(jid, { text: '📊 *DASHBOARD*\n\n👥 Usuários: ' + (stats.totalUsers || 0) + '\n💰 Faturamento: R$ ' + ((stats.totalRevenue || 0)).toFixed(2) + '\n🛍️ Vendas: ' + (stats.totalSales || 0) + '\n💳 Recargas: ' + (stats.totalRecharges || 0) });
            }
            else if (isAdmin && text === '/usuarios') {
                const result = await AdminService.listUsers(1, 20);
                let msg = '👥 *USUÁRIOS* (Total: ' + result.total + ')\n\n';
                result.users.forEach((u, i) => { msg += (i + 1) + '. 📱 ' + u.phone_number + ' | 💰 R$ ' + (u.balance || 0).toFixed(2) + '\n'; });
                await sock.sendMessage(jid, { text: msg });
            }
            else {
                const bal = await UserService.getBalance(user.id);
                const tel = await ConfigService.get('telegram_support');
                await sock.sendMessage(jid, { text: '🐕 *DOGUINHA STORE*\n\n📱 ' + phone + '\n💰 Saldo: R$ ' + bal.toFixed(2) + '\n📧 ' + tel + '\n\nDigite *menu* para ver as opções' });
            }
        });

    } catch (e) {
        console.error('Erro:', e.message);
        setTimeout(startBot, 10000);
    }
}

async function processPix(jid, user, amount) {
    try {
        await sock.sendMessage(jid, { text: '⏳ *Gerando PIX...*' });
        const pix = await PixService.generatePix(user.id, amount);
        const exp = await ConfigService.get('pix_expiration');
        await sock.sendMessage(jid, { text: '💳 *PAGAMENTO PIX*\n\n💰 Valor: R$ ' + amount.toFixed(2) + '\n🆔 ID: ' + pix.pixId + '\n⏰ Expira em: ' + exp + ' min\n\n📋 *CÓDIGO COPIA E COLA:*\n' + pix.copyPaste + '\n\n✅ Confirmação automática!' });
        
        let c = 0;
        const max = (parseInt(exp) * 60) / 10;
        const iv = setInterval(async () => {
            c++;
            try {
                const r = await PixService.checkPaymentStatus(pix.pixId);
                if (r.status === 'approved') {
                    clearInterval(iv);
                    const nb = await UserService.getBalance(user.id);
                    await sock.sendMessage(jid, { text: '✅ *PAGAMENTO APROVADO!*\n\n💸 Recarga: R$ ' + amount.toFixed(2) + '\n💰 Novo saldo: R$ ' + nb.toFixed(2) });
                } else if (r.status === 'rejected' || c >= max) {
                    clearInterval(iv);
                }
            } catch (e) { if (c >= max) clearInterval(iv); }
        }, 10000);
    } catch (e) {
        await sock.sendMessage(jid, { text: '❌ Erro: ' + e.message });
    }
}

process.on('uncaughtException', (e) => console.error('❌', e.message));
process.on('unhandledRejection', (e) => console.error('❌', e));

module.exports = { getInstance: () => ({ isConnected: () => sock?.user ? true : false }) };

console.log('🐕 DOGUINHA STORE BOT v5.0');
console.log('===========================\n');
startBot().catch(console.error);
