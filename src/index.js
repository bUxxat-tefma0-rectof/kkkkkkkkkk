require('dotenv').config();
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, makeCacheableSignalKeyStore } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
const path = require('path');
const express = require('express');
const QRCode = require('qrcode');
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
let currentQR = null;
let userSelectedProduct = {};

const ADMIN_NUMBER = process.env.ADMIN_NUMBER || '554498691568';

const app = express();
app.get('/', (req, res) => res.json({ status: 'online' }));
app.get('/qr', (req, res) => {
    if (currentQR) {
        res.send('<html><head><meta name="viewport" content="width=device-width,initial-scale=1.0"><style>body{background:#000;display:flex;justify-content:center;align-items:center;height:100vh;margin:0}img{width:300px;height:300px}</style></head><body><img src="' + currentQR + '"></body></html>');
    } else {
        res.send('QR Code nao disponivel');
    }
});
app.listen(process.env.PORT || 3000, () => {});

async function startBot() {
    try {
        ['auth', 'database', 'logs'].forEach(d => {
            const p = path.join(__dirname, '..', d);
            if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
        });
        
        await initializeDatabase();
        console.log('✅ Banco pronto!');

        const { state, saveCreds } = await useMultiFileAuthState(path.join(__dirname, '..', 'auth'));
        const { version } = await fetchLatestBaileysVersion();

        sock = makeWASocket({
            version, logger, printQRInTerminal: false,
            auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, logger) },
            browser: ['Safari', 'Chrome', '1.0.0'],
        });

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;
            if (qr) {
                console.log('QR: https://kkkkkkkkkk-1.onrender.com/qr');
                try { currentQR = await QRCode.toDataURL(qr); } catch (e) {}
            }
            if (connection === 'open') console.log('✅ BOT CONECTADO!');
            if (connection === 'close' && lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut) {
                setTimeout(startBot, 5000);
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
            else if (msg.message.buttonsResponseMessage?.selectedButtonId) text = msg.message.buttonsResponseMessage.selectedButtonId;
            if (!text) return;
            text = text.trim();

            const phone = jid.replace('@s.whatsapp.net', '');
            const user = await UserService.getOrCreateUser(phone);
            const bal = await UserService.getBalance(user.id);
            const isAdmin = phone === ADMIN_NUMBER;

            // ADMIN
            if (isAdmin && text === 'admin') {
                const stats = await AdminService.getDashboardStats();
                await sock.sendMessage(jid, { text: '👑 *PAINEL ADMIN*\n\n👥 Usuários: ' + (stats.totalUsers||0) + '\n💰 Faturamento: R$ ' + (stats.totalRevenue||0).toFixed(2) + '\n\n/addproduto Nome|Preço|Estoque\n/broadcast MSG\n/dashboard\n/usuarios' });
            }
            else if (isAdmin && text.startsWith('/addproduto')) {
                const d = text.replace('/addproduto ','').split('|').map(s=>s.trim());
                if (d.length >= 3) {
                    await AdminService.addProduct({ name: d[0], price: parseFloat(d[1]), stock: parseInt(d[2]), category: d[3] || 'Geral' });
                    await sock.sendMessage(jid, { text: '✅ Produto adicionado!' });
                }
            }
            else if (isAdmin && text.startsWith('/broadcast')) {
                const m2 = text.replace('/broadcast ','');
                const r = await AdminService.broadcastMessage(m2, sock);
                await sock.sendMessage(jid, { text: '✅ Enviado: ' + r.sent + '/' + r.total });
            }
            else if (isAdmin && text === '/dashboard') {
                const stats = await AdminService.getDashboardStats();
                await sock.sendMessage(jid, { text: '📊 *DASHBOARD*\n👥 ' + (stats.totalUsers||0) + '\n💰 R$ ' + (stats.totalRevenue||0).toFixed(2) + '\n🛍️ Vendas: ' + (stats.totalSales||0) });
            }
            else if (isAdmin && text === '/usuarios') {
                const result = await AdminService.listUsers(1,20);
                let m3 = '👥 *USUÁRIOS*\n\n';
                result.users.forEach(u => m3 += '📱 ' + u.phone_number + ' | 💰 R$ ' + (u.balance||0).toFixed(2) + '\n');
                await sock.sendMessage(jid, { text: m3 });
            }
            // MENU PRINCIPAL
            else if (['oi','ola','menu','1'].includes(text.toLowerCase())) {
                await sock.sendMessage(jid, { text: '╭═══════════════════╮\n│  🐕 DOGUINHA STORE  │\n╰═══════════════════╯\n\n👤 *Seus Dados*\n▸ 📱 `' + phone + '`\n▸ 💰 Saldo: *R$ ' + bal.toFixed(2) + '*\n▸ 📧 @doguinhastore\n\n━━━━━━━━━━━━━━━━━━\n📋 *MENU PRINCIPAL*\n━━━━━━━━━━━━━━━━━━\n\n💸 *1* - Adicionar Saldo\n🛍️ *2* - Assinaturas\n💼 *3* - Associado\n👤 *4* - Suporte\n\n_Digite o número_' });
            }
            // PIX
            else if (text === 'pix_5') await processPix(jid, user, 5);
            else if (text === 'pix_8') await processPix(jid, user, 8);
            else if (text === 'pix_20') await processPix(jid, user, 20);
            else if (text === 'pix_custom') await sock.sendMessage(jid, { text: '💎 Digite o valor (min R$ 5):' });
            else if (!isNaN(text) && parseFloat(text) >= 5 && !['1','2','3','4'].includes(text)) await processPix(jid, user, parseFloat(text));
            // CATÁLOGO
            else if (text === '2') {
                const products = await ProductService.getAvailableProducts();
                if (products.length === 0) {
                    await sock.sendMessage(jid, { text: '🛍️ *CATÁLOGO*\n\nNenhum produto disponível.' });
                } else {
                    let cat = '🛍️ *CATÁLOGO*\n💰 Saldo: R$ ' + bal.toFixed(2) + '\n\n';
                    products.slice(0,10).forEach(p => cat += '📦 *' + p.name + '*\n💰 R$ ' + p.price.toFixed(2) + ' | 📦 ' + p.stock + ' unid.\n_Digite *comprar ' + p.id + '*_\n\n');
                    await sock.sendMessage(jid, { text: cat });
                }
            }
            // COMPRAR
            else if (text.startsWith('comprar ')) {
                const pid = parseInt(text.replace('comprar ',''));
                const product = await ProductService.getProductById(pid);
                if (!product) { await sock.sendMessage(jid, { text: '❌ Produto não encontrado!' }); return; }
                if (bal < product.price) { await sock.sendMessage(jid, { text: '❌ Saldo insuficiente! Falta R$ ' + (product.price-bal).toFixed(2) }); return; }
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
                } else {
                    await sock.sendMessage(jid, { text: '❌ ' + result.message });
                }
            }
            else if (text.toLowerCase() === 'cancelar') {
                delete userSelectedProduct[user.id];
                await sock.sendMessage(jid, { text: '❌ Cancelado.' });
            }
            // ASSOCIADO
            else if (text === '3') {
                const ref = await ReferralService.getReferralStats(user.id);
                await sock.sendMessage(jid, { text: '💼 *ASSOCIADO*\n\n🔗 Link: ' + user.referral_link + '\n📝 Código: ' + user.referral_code + '\n💰 Comissão: R$ ' + (user.commission_balance||0).toFixed(2) + '\n👥 Indicados: ' + (ref.total_referrals||0) + '\n📊 Percentual: 10%' });
            }
            // SUPORTE
            else if (text === '4') {
                await sock.sendMessage(jid, { text: '👤 *SUPORTE*\n\n📱 Telegram: @doguinhastore\n⏰ Seg-Sex: 09h-18h\n📅 Sáb: 09h-13h' });
            }
            // DEFAULT
            else {
                await sock.sendMessage(jid, { text: '╭═══════════════════╮\n│  🐕 DOGUINHA STORE  │\n╰═══════════════════╯\n\n👤 *Seus Dados*\n▸ 📱 `' + phone + '`\n▸ 💰 Saldo: *R$ ' + bal.toFixed(2) + '*\n\n💸 *1* - Adicionar Saldo\n🛍️ *2* - Assinaturas\n💼 *3* - Associado\n👤 *4* - Suporte\n\n_Digite o número_' });
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
        await sock.sendMessage(jid, { text: '💳 *PIX GERADO*\n\n💰 Valor: R$ ' + amount.toFixed(2) + '\n🆔 ID: ' + pix.pixId + '\n\n📋 *Código Copia e Cola:*\n```' + pix.copyPaste + '```\n\n⏰ Expira em 30 minutos\n✅ Confirmação automática!' });
        
        let c = 0;
        const iv = setInterval(async () => {
            c++;
            try {
                const r = await PixService.checkPaymentStatus(pix.pixId);
                if (r.status === 'approved') {
                    clearInterval(iv);
                    const nb = await UserService.getBalance(user.id);
                    await sock.sendMessage(jid, { text: '✅ *PAGO!*\n💰 Novo saldo: R$ ' + nb.toFixed(2) });
                } else if (c >= 180) clearInterval(iv);
            } catch (e) { if (c >= 180) clearInterval(iv); }
        }, 10000);
    } catch (e) {
        await sock.sendMessage(jid, { text: '❌ Erro: ' + e.message });
    }
}

process.on('uncaughtException', (e) => console.error(e.message));
console.log('🐕 DOGUINHA STORE\n');
startBot().catch(console.error);
