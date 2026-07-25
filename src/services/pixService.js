const axios = require('axios');
const { db } = require('../database/init');
const config = require('../config/settings');
const QRCode = require('qrcode');

class PixService {
    constructor() {
        this.mpAccessToken = process.env.MP_ACCESS_TOKEN;
        this.baseURL = 'https://api.mercadopago.com/v1';
    }

    async generatePix(userId, amount) {
        try {
            // Validar valor mínimo
            if (amount < config.pix.minValue) {
                throw new Error(`Valor mínimo para PIX: R$ ${config.pix.minValue}`);
            }

            const expirationDate = new Date();
            expirationDate.setMinutes(expirationDate.getMinutes() + config.pix.expirationMinutes);

            // Criar pagamento no Mercado Pago
            const paymentData = {
                transaction_amount: amount,
                description: `Recarga Doguinha Store - ${amount}`,
                payment_method_id: 'pix',
                payer: {
                    email: `user${userId}@doguinhastore.com`,
                    first_name: 'Cliente',
                    last_name: 'Doguinha Store'
                },
                date_of_expiration: expirationDate.toISOString()
            };

            const response = await axios.post(
                `${this.baseURL}/payments`,
                paymentData,
                {
                    headers: {
                        'Authorization': `Bearer ${this.mpAccessToken}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            const payment = response.data;
            
            // Gerar QR Code
            const qrCodeImage = await QRCode.toDataURL(payment.point_of_interaction.transaction_data.qr_code);

            // Salvar no banco de dados
            const pixId = payment.id.toString();
            const copyPaste = payment.point_of_interaction.transaction_data.qr_code;
            
            await this.savePixRecharge(userId, amount, pixId, qrCodeImage, copyPaste, expirationDate);

            return {
                success: true,
                pixId: pixId,
                qrCode: qrCodeImage,
                copyPaste: copyPaste,
                amount: amount,
                expirationDate: expirationDate,
                message: this.formatPixMessage(amount, pixId, copyPaste, expirationDate)
            };

        } catch (error) {
            console.error('Erro ao gerar PIX:', error);
            throw error;
        }
    }

    async savePixRecharge(userId, amount, pixId, qrCode, copyPaste, expirationDate) {
        return new Promise((resolve, reject) => {
            db.run(
                `INSERT INTO pix_recharges (user_id, amount, pix_id, qr_code, copy_paste, expires_at) 
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [userId, amount, pixId, qrCode, copyPaste, expirationDate.toISOString()],
                (err) => {
                    if (err) reject(err);
                    else resolve(true);
                }
            );
        });
    }

    async checkPaymentStatus(pixId) {
        try {
            const response = await axios.get(
                `${this.baseURL}/payments/${pixId}`,
                {
                    headers: {
                        'Authorization': `Bearer ${this.mpAccessToken}`
                    }
                }
            );

            const payment = response.data;
            
            if (payment.status === 'approved') {
                await this.confirmPayment(pixId);
                return { status: 'approved', payment };
            } else if (payment.status === 'pending') {
                return { status: 'pending', payment };
            } else {
                return { status: 'rejected', payment };
            }

        } catch (error) {
            console.error('Erro ao verificar pagamento:', error);
            throw error;
        }
    }

    async confirmPayment(pixId) {
        return new Promise((resolve, reject) => {
            db.get(
                'SELECT * FROM pix_recharges WHERE pix_id = ? AND status = ?',
                [pixId, 'pending'],
                async (err, recharge) => {
                    if (err) {
                        reject(err);
                        return;
                    }

                    if (!recharge) {
                        resolve(false);
                        return;
                    }

                    // Atualizar status da recarga
                    db.run(
                        'UPDATE pix_recharges SET status = ?, paid_at = CURRENT_TIMESTAMP WHERE pix_id = ?',
                        ['completed', pixId],
                        async (err) => {
                            if (err) {
                                reject(err);
                                return;
                            }

                            // Adicionar saldo ao usuário
                            const UserService = require('./userService');
                            await UserService.updateBalance(recharge.user_id, recharge.amount, 'credit');

                            // Verificar indicação e gerar comissão
                            const ReferralService = require('./referralService');
                            await ReferralService.processReferralCommission(recharge.user_id, recharge.amount);

                            resolve(true);
                        }
                    );
                }
            );
        });
    }

    async checkExpiredPayments() {
        return new Promise((resolve, reject) => {
            db.run(
                `UPDATE pix_recharges 
                 SET status = 'expired' 
                 WHERE status = 'pending' 
                 AND expires_at < datetime('now')`,
                (err) => {
                    if (err) reject(err);
                    else resolve(true);
                }
            );
        });
    }

    formatPixMessage(amount, pixId, copyPaste, expirationDate) {
        const formattedDate = expirationDate.toLocaleString('pt-BR');
        const formattedTime = expirationDate.toLocaleTimeString('pt-BR');
        
        return `💳 *PAGAMENTO PIX*\n\n` +
               `💰 Valor: R$ ${amount.toFixed(2)}\n` +
               `🆔 ID: ${pixId}\n` +
               `⏰ Vencimento: ${formattedDate} às ${formattedTime}\n\n` +
               `📋 *CÓDIGO PIX:*\n\`\`\`${copyPaste}\`\`\`\n\n` +
               `_⚠️ O código expira em ${config.pix.expirationMinutes} minutos_`;
    }

    async getUserRecharges(userId) {
        return new Promise((resolve, reject) => {
            db.all(
                'SELECT * FROM pix_recharges WHERE user_id = ? ORDER BY created_at DESC LIMIT 10',
                [userId],
                (err, recharges) => {
                    if (err) reject(err);
                    else resolve(recharges);
                }
            );
        });
    }
}

module.exports = new PixService();
