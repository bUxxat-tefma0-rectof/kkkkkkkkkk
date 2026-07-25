const axios = require('axios');
const { getDatabase, saveDatabase } = require('../database/init');
const config = require('../config/settings');
const QRCode = require('qrcode');

class PixService {
    constructor() {
        this.mpAccessToken = process.env.MP_ACCESS_TOKEN;
        this.baseURL = 'https://api.mercadopago.com/v1';
    }

    async generatePix(userId, amount) {
        try {
            if (amount < config.pix.minValue) {
                throw new Error(`Valor mínimo para PIX: R$ ${config.pix.minValue}`);
            }

            const expirationDate = new Date();
            expirationDate.setMinutes(expirationDate.getMinutes() + config.pix.expirationMinutes);

            const paymentData = {
                transaction_amount: amount,
                description: `Recarga Doguinha Store - R$ ${amount.toFixed(2)}`,
                payment_method_id: 'pix',
                payer: {
                    email: `cliente${userId}@doguinhastore.com`,
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
            const qrCodeImage = await QRCode.toDataURL(
                payment.point_of_interaction.transaction_data.qr_code
            );

            const pixId = payment.id.toString();
            const copyPaste = payment.point_of_interaction.transaction_data.qr_code;

            await this.savePixRecharge(userId, amount, pixId, qrCodeImage, copyPaste, expirationDate);

            return {
                success: true,
                pixId: pixId,
                qrCode: qrCodeImage,
                copyPaste: copyPaste,
                amount: amount,
                expirationDate: expirationDate
            };

        } catch (error) {
            console.error('Erro ao gerar PIX:', error.response?.data || error.message);
            throw new Error('Erro ao gerar PIX. Verifique seu token do Mercado Pago.');
        }
    }

    async savePixRecharge(userId, amount, pixId, qrCode, copyPaste, expirationDate) {
        const db = getDatabase();
        db.run(
            `INSERT INTO pix_recharges (user_id, amount, pix_id, qr_code, copy_paste, expires_at) 
             VALUES (?, ?, ?, ?, ?, ?)`,
            [userId, amount, pixId, qrCode, copyPaste, expirationDate.toISOString()]
        );
        saveDatabase(process.env.DB_PATH);
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
            console.error('Erro ao verificar pagamento:', error.message);
            return { status: 'error' };
        }
    }

    async confirmPayment(pixId) {
        const db = getDatabase();
        
        const stmt = db.prepare('SELECT * FROM pix_recharges WHERE pix_id = ? AND status = ?');
        stmt.bind([pixId, 'pending']);
        
        let recharge = null;
        if (stmt.step()) {
            recharge = stmt.getAsObject();
        }
        stmt.free();

        if (!recharge) return false;

        db.run('UPDATE pix_recharges SET status = ?, paid_at = CURRENT_TIMESTAMP WHERE pix_id = ?', ['completed', pixId]);
        saveDatabase(process.env.DB_PATH);

        const UserService = require('./userService');
        await UserService.updateBalance(recharge.user_id, recharge.amount, 'credit');

        const ReferralService = require('./referralService');
        await ReferralService.processReferralCommission(recharge.user_id, recharge.amount);

        return true;
    }

    async checkExpiredPayments() {
        const db = getDatabase();
        db.run(`UPDATE pix_recharges SET status = 'expired' WHERE status = 'pending' AND expires_at < datetime('now')`);
        saveDatabase(process.env.DB_PATH);
    }
}

module.exports = new PixService();
