const express = require('express');

class PairingServer {
    constructor() {
        this.app = express();
        this.code = null;
        this.resolve = null;
        this.setupRoutes();
    }

    setupRoutes() {
        this.app.use(express.json());
        this.app.use(express.urlencoded({ extended: true }));

        // Página para digitar o código
        this.app.get('/pair', (req, res) => {
            res.send(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Doguinha Store - Pareamento</title>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <style>
                        * { margin: 0; padding: 0; box-sizing: border-box; }
                        body {
                            font-family: -apple-system, Arial, sans-serif;
                            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                            display: flex;
                            justify-content: center;
                            align-items: center;
                            min-height: 100vh;
                            padding: 20px;
                        }
                        .card {
                            background: white;
                            border-radius: 20px;
                            padding: 30px;
                            width: 100%;
                            max-width: 400px;
                            text-align: center;
                            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
                        }
                        h1 { font-size: 3em; margin-bottom: 10px; }
                        h2 { color: #333; margin-bottom: 20px; }
                        p { color: #666; margin-bottom: 20px; font-size: 14px; }
                        input {
                            width: 100%;
                            padding: 15px;
                            font-size: 24px;
                            text-align: center;
                            border: 3px solid #667eea;
                            border-radius: 10px;
                            margin-bottom: 15px;
                            letter-spacing: 5px;
                            font-weight: bold;
                        }
                        button {
                            width: 100%;
                            padding: 15px;
                            font-size: 18px;
                            background: #667eea;
                            color: white;
                            border: none;
                            border-radius: 10px;
                            cursor: pointer;
                            font-weight: bold;
                        }
                        button:active { background: #764ba2; }
                        .status { margin-top: 15px; font-weight: bold; }
                        .success { color: #4CAF50; }
                        .error { color: #f44336; }
                    </style>
                </head>
                <body>
                    <div class="card">
                        <h1>🐕</h1>
                        <h2>Doguinha Store</h2>
                        <p>📱 Digite o código de 8 dígitos que aparece no WhatsApp do seu iPhone</p>
                        
                        <input type="text" id="code" placeholder="XXXXXXXX" maxlength="8" inputmode="numeric" pattern="[0-9]*" autocomplete="off">
                        <button onclick="sendCode()">🔐 Conectar</button>
                        <p id="status" class="status"></p>
                        
                        <script>
                            async function sendCode() {
                                const code = document.getElementById('code').value;
                                const status = document.getElementById('status');
                                
                                if (code.length !== 8) {
                                    status.className = 'status error';
                                    status.textContent = '❌ Digite 8 dígitos!';
                                    return;
                                }
                                
                                status.className = 'status';
                                status.textContent = '⏳ Conectando...';
                                
                                try {
                                    const response = await fetch('/set-code', {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ code: code })
                                    });
                                    const data = await response.json();
                                    
                                    if (data.success) {
                                        status.className = 'status success';
                                        status.textContent = '✅ Código enviado! Confirme no WhatsApp!';
                                        document.getElementById('code').disabled = true;
                                    } else {
                                        status.className = 'status error';
                                        status.textContent = '❌ ' + data.error;
                                    }
                                } catch (e) {
                                    status.className = 'status error';
                                    status.textContent = '❌ Erro de conexão';
                                }
                            }
                        </script>
                    </div>
                </body>
                </html>
            `);
        });

        // Receber código
        this.app.post('/set-code', (req, res) => {
            const { code } = req.body;
            if (code && code.length === 8) {
                this.code = code;
                if (this.resolve) {
                    this.resolve(code);
                    this.resolve = null;
                }
                res.json({ success: true });
            } else {
                res.json({ success: false, error: 'Código inválido! Deve ter 8 dígitos.' });
            }
        });
    }

    async waitForCode() {
        return new Promise((resolve) => {
            this.resolve = resolve;
            // Timeout de 5 minutos
            setTimeout(() => {
                if (this.resolve) {
                    this.resolve(null);
                    this.resolve = null;
                }
            }, 300000);
        });
    }

    start(port = 3456) {
        this.app.listen(port, () => {
            console.log('🔗 Página de pareamento: http://localhost:' + port + '/pair');
        });
    }
}

module.exports = PairingServer;
