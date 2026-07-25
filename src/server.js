require('dotenv').config();
const express = require('express');

let pairingCode = null;
let pairingResolve = null;

class KeepAliveServer {
    constructor() {
        this.app = express();
        this.port = process.env.PORT || 3000;
        this.app.use(express.json());
        this.app.use(express.urlencoded({ extended: true }));
        this.setupRoutes();
    }

    setupRoutes() {
        this.app.get('/', (req, res) => {
            res.json({ status: 'online', bot: 'Doguinha Store', version: '1.0.0', timestamp: new Date().toISOString() });
        });

        this.app.get('/health', (req, res) => {
            res.json({ status: 'healthy' });
        });

        this.app.get('/dashboard', (req, res) => {
            res.send('<!DOCTYPE html><html><head><title>Doguinha Store</title><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><style>body{font-family:Arial;background:linear-gradient(135deg,#667eea,#764ba2);display:flex;justify-content:center;align-items:center;height:100vh;margin:0}.card{background:white;border-radius:20px;padding:40px;text-align:center}h1{font-size:3em}p{color:#666}</style></head><body><div class="card"><h1>🐕</h1><h2>Doguinha Store Bot</h2><p>✅ Bot Online</p></div></body></html>');
        });

        this.app.get('/pair', (req, res) => {
            res.send('<!DOCTYPE html><html><head><title>Pareamento</title><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,Arial;background:linear-gradient(135deg,#667eea,#764ba2);display:flex;justify-content:center;align-items:center;min-height:100vh;padding:20px}.card{background:white;border-radius:20px;padding:30px;width:100%;max-width:400px;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,.3)}h1{font-size:3em;margin-bottom:10px}h2{color:#333;margin-bottom:20px}p{color:#666;margin-bottom:20px;font-size:14px}input{width:100%;padding:15px;font-size:24px;text-align:center;border:3px solid #667eea;border-radius:10px;margin-bottom:15px;letter-spacing:5px;font-weight:bold}button{width:100%;padding:15px;font-size:18px;background:#667eea;color:white;border:none;border-radius:10px;cursor:pointer;font-weight:bold}button:active{background:#764ba2}.status{margin-top:15px;font-weight:bold}.success{color:#4CAF50}.error{color:#f44336}</style></head><body><div class="card"><h1>🐕</h1><h2>Doguinha Store</h2><p>📱 Digite o código de 8 dígitos do WhatsApp</p><input type="text" id="code" placeholder="XXXXXXXX" maxlength="8" inputmode="numeric" autocomplete="off"><button onclick="sendCode()">🔐 Conectar</button><p id="status" class="status"></p><script>async function sendCode(){const code=document.getElementById("code").value;const status=document.getElementById("status");if(code.length!==8){status.className="status error";status.textContent="❌ Digite 8 dígitos!";return}status.className="status";status.textContent="⏳ Conectando...";try{const response=await fetch("/set-code",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({code:code})});const data=await response.json();if(data.success){status.className="status success";status.textContent="✅ Código enviado! Confirme no WhatsApp!";document.getElementById("code").disabled=true}else{status.className="status error";status.textContent="❌ "+data.error}}catch(e){status.className="status error";status.textContent="❌ Erro de conexão"}}</script></div></body></html>');
        });

        this.app.post('/set-code', (req, res) => {
            const { code } = req.body;
            if (code && code.length === 8) {
                pairingCode = code;
                if (pairingResolve) {
                    pairingResolve(code);
                    pairingResolve = null;
                }
                res.json({ success: true });
            } else {
                res.json({ success: false, error: 'Código inválido! Deve ter 8 dígitos.' });
            }
        });

        this.app.use((req, res) => {
            res.status(404).json({ error: 'Rota não encontrada' });
        });
    }

    waitForPairingCode() {
        return new Promise((resolve) => {
            pairingResolve = resolve;
            setTimeout(() => {
                if (pairingResolve) {
                    pairingResolve(null);
                    pairingResolve = null;
                }
            }, 300000);
        });
    }

    start() {
        return new Promise((resolve, reject) => {
            this.server = this.app.listen(this.port, () => {
                console.log('🌐 Servidor rodando na porta ' + this.port);
                resolve(this.server);
            });
            this.server.on('error', reject);
        });
    }

    stop() {
        if (this.server) this.server.close();
    }
}

module.exports = KeepAliveServer;
