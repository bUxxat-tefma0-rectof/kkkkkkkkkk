require('dotenv').config();
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, makeCacheableSignalKeyStore } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
const path = require('path');
const express = require('express');
const UserService = require('./services/userService');
const PixService = require('./services/pixService');
const ProductService = require('./services/productService');
const PurchaseService = require('./services/purchaseService');
const AdminService = require('./services/adminService');
const ReferralService = require('./services/referralService');
const ConfigService = require('./services/configService');
const { initializeDatabase } = require('./database/init');
const logger = pino({ level: 'silent' });
let sock = null;
let userSelectedProduct = {};

const app = express();
app.get('/', (req, res) => res.json({ status: 'online' }));
app.listen(process.env.PORT || 3000, () => {});

async function startBot() {
    try {
        ['auth', 'database', 'logs'].forEach(d => {
            const p = path.join(__dirname, '..', d);
            if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
        });
        
        console.log('📦 Banco...');
        await initializeDatabase();
        console.log('✅ Pronto!\n');

        const { state, saveCreds } = await useMultiFileAuthState(path.join(__dirname, '..', 'auth'));
        const { version } = await fetchLatestBaileysVersion();
        console.log('📱 WA v' + version.join('.') + '\n');

        sock = makeWASocket({
            version, logger, printQRInTerminal: true,
            auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, logger) },
            browser: ['Safari', 'Chrome', '1.0.0'],
        });

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect, qr } = update;
            
            if (qr) {
                console.log('\n╔══════════════════════════════════╗');
                console.log('║   ESCANEIE O QR CODE ABAIXO     ║');
                console.log('╚══════════════════════════════════╝\n');
                const qrcode = require('qrcode-terminal');
                qrcode.generate(qr, { small: true });
                console.log('\n⏳ Aguardando scan...\n');
            }

            if (connection === 'open') {
                console.log('\n✅ BOT CONECTADO! ' + sock.user.id.split(':')[0] + '\n');
            }

            if (connection === 'close') {
                if (lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut) {
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

            if (['oi', 'ola', 'menu', 'inicio'].includes(text.toLowerCase())) {
                const bal = await UserService.getBalance(user.id);
                const tel = await ConfigService.get('telegram_support');
                await sock.sendMessage(jid, { text: '🐕 *DOGUINHA STORE*\n\n📱 ' + phone + '\n💰 Saldo: R$ ' + bal.toFixed(2) + '\n📧 Suporte: ' + tel + '\n\nEscolha uma opção:' });
                await sock.sendMessage(jid, {
                    title: '🐕 DOGUINHA STORE', text: '🐕 DOGUINHA STORE', buttonText: '📱 Opções',
                    sections: [{ title: '📋 MENU', rows: [
                        { title: '💸 Adicionar Saldo', rowId: 'menu_add_balance' },
                        { title: '🛍️ Assinaturas Premium', rowId: 'menu_products' },
                        { title: '💼 Área do Associado', rowId: 'menu_affiliate' },
                        { title: '👤 Suporte', rowId: 'menu_support' }
                    ]}]
                });
            }
            else if (text === 'menu_add_balance') {
                await sock.sendMessage(jid, { text: '💸 *PIX*\n\nEscolha o valor:' });
                await sock.sendMessage(jid, {
                    title: '💸 PIX', text: '💸 PIX', buttonText: '💳 Valores',
                    sections: [{ title: '💰', rows: [
                        { title: 'R$ 5,00', rowId: 'pix_5' },
                        { title: 'R$ 8,00', rowId: 'pix_8' },
                        { title: 'R$ 20,00', rowId: 'pix_20' },
                        { title: 'Outro valor', rowId: 'pix_custom' }
                    ]}]
                });
            }
            else if (text === 'menu_products') {
                const bal = await UserService.getBalance(user.id);
                const products = await ProductService.getAvailableProducts();
                await sock.sendMessage(jid, { text: '🛍️ *CATÁLOGO*\n💰 Saldo: R$ ' + bal.toFixed(2) });
                if (products.length === 0) {
                    await sock.sendMessage(jid, { text: 'Nenhum produto.' });
                } else {
                    const rows = products.slice(0, 10).map(p => ({ title: p.name, rowId: 'product_' + p.id, description: 'R$ ' + p.price.toFixed(2) + ' | Estoque: ' + p.stock }));
                    await sock.sendMessage(jid, { title: 'Catálogo', text: 'Catálogo', buttonText: 'Ver', sections: [{ title: 'Produtos', rows }] });
                }
            }
            else if (text === 'menu_affiliate') {
                const ref = await ReferralService.getReferralStats(user.id);
                await sock.sendMessage(jid, { text: '💼 *ASSOCIADO*\n\nCódigo: ' + user.referral_code + '\nComissão: R$ ' + (user.commission_balance || 0).toFixed(2) + '\nIndicados: ' + (ref.total_referrals || 0) });
            }
            else if (text === 'menu_support') {
                const tel = await ConfigService.get('telegram_support');
                await sock.sendMessage(jid, { text: '👤 *SUPORTE*\n\n' + tel });
            }
            else if (text === 'pix_5') await processPix(jid, user, 5);
            else if (text === 'pix_8') await processPix(jid, user, 8);
            else if (text === 'pix_20') await processPix(jid, user, 20);
            else if (text === 'pix_custom') await sock.sendMessage(jid, { text: 'Digite o valor:' });
            else if (!isNaN(text) && parseFloat(text) >= 5) await processPix(jid, user, parseFloat(text));
            else if (text.startsWith('product_')) {
                const pid = parseInt(text.replace('product_', ''));
                const product = await ProductService.getProductById(pid);
                const bal = await UserService.getBalance(user.id);
                if (!product) return;
                if (bal < product.price) { await sock.sendMessage(jid, { text: 'Saldo insuficiente!' }); return; }
                userSelectedProduct[user.id] = pid;
                await sock.sendMessage(jid, { text: '🛒 *' + product.name + '*\n💰 R$ ' + product.price.toFixed(2) + '\n\nDigite *confirmar* ou *cancelar*' });
            }
            else if (text.toLowerCase() === 'confirmar') {
                const pid = userSelectedProduct[user.id];
                if (!pid) return;
                const result = await PurchaseService.processPurchase(user.id, pid);
                if (result.success) {
                    await sock.sendMessage(jid, { text: '✅ *COMPRADO!*\n📧 Login: ' + result.credentials.login + '\n🔑 Senha: ' + result.credentials.password });
                    delete userSelectedProduct[user.id];
                }
            }
            else if (text.toLowerCase() === 'cancelar') {
                delete userSelectedProduct[user.id];
                await sock.sendMessage(jid, { text: 'Cancelado.' });
            }
        });
    } catch (e) {
        console.error('Erro:', e.message);
        setTimeout(startBot, 10000);
    }
}

async function processPix(jid, user, amount) {
    try {
        await sock.sendMessage(jid, { text: '⏳ Gerando PIX...' });
        const pix = await PixService.generatePix(user.id, amount);
        await sock.sendMessage(jid, { text: '💳 *PIX*\n\n💰 R$ ' + amount.toFixed(2) + '\n🆔 ' + pix.pixId + '\n\n📋 Código:\n' + pix.copyPaste });
    } catch (e) {
        await sock.sendMessage(jid, { text: 'Erro: ' + e.message });
    }
}

process.on('uncaughtException', (e) => console.error(e.message));
console.log('🐕 DOGUINHA STORE BOT\n');
startBot().catch(console.error);
