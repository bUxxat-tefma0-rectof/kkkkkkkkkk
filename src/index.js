require('dotenv').config();
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, makeCacheableSignalKeyStore } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
const path = require('path');
const express = require('express');
const QRCode = require('qrcode');
const { initializeDatabase } = require('./database/init');
const logger = pino({ level: 'silent' });
let sock = null;
let currentQR = null;

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
                console.log('QR CODE: https://kkkkkkkkkk-1.onrender.com/qr');
                try { currentQR = await QRCode.toDataURL(qr); } catch (e) {}
            }

            if (connection === 'open') {
                console.log('✅ BOT CONECTADO! ' + sock.user.id.split(':')[0]);
                currentQR = null;
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
            if (!text) return;
            text = text.trim();

            console.log('📩 ' + text);

            const phone = jid.replace('@s.whatsapp.net', '');
            
            if (['oi', 'ola', 'menu', 'inicio', '1'].includes(text.toLowerCase())) {
                await sock.sendMessage(jid, { text: '🐕 *DOGUINHA STORE*\n\n📱 ' + phone + '\n💰 Saldo: R$ 0.00\n📧 @doguinhastore\n\n*MENU PRINCIPAL:*\n\n1️⃣ 💸 Adicionar Saldo\n2️⃣ 🛍️ Assinaturas Premium\n3️⃣ 💼 Área do Associado\n4️⃣ 👤 Contato do Suporte\n\n_Digite o número da opção_' });
            }
            else if (text === '2') {
                await sock.sendMessage(jid, { text: '🛍️ *CATÁLOGO*\n\nEm breve produtos disponíveis!\n\n0️⃣ Voltar ao menu' });
            }
            else if (text === '3') {
                await sock.sendMessage(jid, { text: '💼 *ÁREA DO ASSOCIADO*\n\n🔗 Seu link: wa.me/554498691568\n📝 Código: DOG' + phone.slice(-4) + '\n💰 Comissão: 10%\n\n0️⃣ Voltar ao menu' });
            }
            else if (text === '4') {
                await sock.sendMessage(jid, { text: '👤 *SUPORTE*\n\n📱 Telegram: @doguinhastore\n\n⏰ Seg-Sex: 09h-18h\n\n0️⃣ Voltar ao menu' });
            }
            else if (text === '0') {
                await sock.sendMessage(jid, { text: '🐕 *MENU PRINCIPAL*\n\n1️⃣ 💸 Adicionar Saldo\n2️⃣ 🛍️ Assinaturas Premium\n3️⃣ 💼 Área do Associado\n4️⃣ 👤 Contato do Suporte\n\n_Digite o número da opção_' });
            }
            else {
                await sock.sendMessage(jid, { text: '🐕 Digite *oi* ou *1* para ver o menu principal' });
            }
        });

    } catch (e) {
        console.error('Erro:', e.message);
        setTimeout(startBot, 10000);
    }
}

process.on('uncaughtException', (e) => console.error(e.message));
console.log('🐕 DOGUINHA STORE\n');
startBot().catch(console.error);
