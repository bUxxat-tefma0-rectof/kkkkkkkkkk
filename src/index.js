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
            else if (msg.message.listResponseMessage?.singleSelectReply?.selectedRowId) text = msg.message.listResponseMessage.singleSelectReply.selectedRowId;
            if (!text) return;
            text = text.trim();

            console.log('📩 ' + text);

            const phone = jid.replace('@s.whatsapp.net', '');
            
            if (['oi', 'ola', 'menu', 'inicio'].includes(text.toLowerCase())) {
                await sock.sendMessage(jid, { text: '🐕 *DOGUINHA STORE*\n\n📱 ' + phone + '\n💰 Saldo: R$ 0.00\n📧 @doguinhastore\n\nEscolha uma opção:' });
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
                await sock.sendMessage(jid, { text: '💸 *MENU PIX*\n\nEscolha o valor:' });
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
                await sock.sendMessage(jid, { text: '🛍️ *CATÁLOGO*\n\nEm breve produtos disponíveis!' });
            }
            else if (text === 'menu_affiliate') {
                await sock.sendMessage(jid, { text: '💼 *ASSOCIADO*\n\nCódigo: DOG' + phone.slice(-4) + '\nComissão: 10%' });
            }
            else if (text === 'menu_support') {
                await sock.sendMessage(jid, { text: '👤 *SUPORTE*\n\n@doguinhastore\n\nAtendimento via Telegram' });
            }
            else {
                await sock.sendMessage(jid, { text: 'Digite *oi* para ver o menu 🐕' });
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
