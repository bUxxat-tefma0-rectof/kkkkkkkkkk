require('dotenv').config();
const express = require('express');

class KeepAliveServer {
    constructor() {
        this.app = express();
        this.port = process.env.PORT || 3000;
        this.setupRoutes();
    }

    setupRoutes() {
        // Rota principal
        this.app.get('/', (req, res) => {
            res.status(200).json({
                status: 'online',
                bot: process.env.BOT_NAME || 'Doguinha Store',
                version: '1.0.0',
                timestamp: new Date().toISOString()
            });
        });

        // Health check (para Render)
        this.app.get('/health', (req, res) => {
            res.status(200).json({
                status: 'healthy',
                uptime: process.uptime(),
                memory: process.memoryUsage().heapUsed / 1024 / 1024
            });
        });

        // Status do bot
        this.app.get('/status', (req, res) => {
            const bot = require('./index').getInstance();
            res.status(200).json({
                connected: bot ? bot.isConnected() : false,
                timestamp: new Date().toISOString()
            });
        });

        // Página bonita
        this.app.get('/dashboard', (req, res) => {
            res.send(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>🐕 Doguinha Store Bot</title>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <style>
                        body {
                            font-family: Arial, sans-serif;
                            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                            display: flex;
                            justify-content: center;
                            align-items: center;
                            height: 100vh;
                            margin: 0;
                        }
                        .card {
                            background: white;
                            border-radius: 20px;
                            padding: 40px;
                            text-align: center;
                            box-shadow: 0 10px 40px rgba(0,0,0,0.2);
                        }
                        h1 { font-size: 3em; margin: 0; }
                        p { color: #666; font-size: 1.2em; }
                        .status { color: #4CAF50; font-weight: bold; }
                    </style>
                </head>
                <body>
                    <div class="card">
                        <h1>🐕</h1>
                        <h2>Doguinha Store Bot</h2>
                        <p class="status">✅ Bot Online</p>
                        <p>O bot está funcionando corretamente!</p>
                    </div>
                </body>
                </html>
            `);
        });

        // 404
        this.app.use((req, res) => {
            res.status(404).json({ error: 'Rota não encontrada' });
        });
    }

    start() {
        return new Promise((resolve, reject) => {
            this.server = this.app.listen(this.port, () => {
                console.log(`🌐 Servidor web rodando na porta ${this.port}`);
                console.log(`🔗 Acesse: http://localhost:${this.port}/dashboard`);
                resolve(this.server);
            });

            this.server.on('error', (error) => {
                if (error.code === 'EADDRINUSE') {
                    console.log(`⚠️ Porta ${this.port} em uso, tentando ${this.port + 1}...`);
                    this.port++;
                    this.server.listen(this.port);
                } else {
                    reject(error);
                }
            });
        });
    }

    stop() {
        if (this.server) {
            this.server.close();
        }
    }
}

module.exports = KeepAliveServer;
