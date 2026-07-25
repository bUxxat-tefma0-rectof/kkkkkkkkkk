const { db } = require('../database/init');
const config = require('../config/settings');

class ReferralService {
    static async processReferral(referralCode, newUserId) {
        return new Promise((resolve, reject) => {
            // Buscar usuário dono do código de indicação
            db.get(
                'SELECT id FROM users WHERE referral_code = ?',
                [referralCode],
                (err, referrer) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    
                    if (!referrer || referrer.id === newUserId) {
                        resolve(false); // Código inválido ou auto-indicação
                        return;
                    }
                    
                    // Registrar indicação
                    db.run(
                        'INSERT INTO referrals (referrer_id, referred_id) VALUES (?, ?)',
                        [referrer.id, newUserId],
                        (err) => {
                            if (err) {
                                reject(err);
                                return;
                            }
                            
                            // Atualizar total de indicados do referenciador
                            db.run(
                                'UPDATE users SET total_referrals = total_referrals + 1 WHERE id = ?',
                                [referrer.id]
                            );
                            
                            resolve(true);
                        }
                    );
                }
            );
        });
    }
    
    static async processReferralCommission(referredUserId, purchaseAmount) {
        return new Promise((resolve, reject) => {
            // Encontrar quem indicou este usuário
            db.get(
                'SELECT r.*, u.commission_balance FROM referrals r JOIN users u ON r.referrer_id = u.id WHERE r.referred_id = ? AND r.status = ?',
                [referredUserId, 'active'],
                async (err, referral) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    
                    if (!referral) {
                        resolve(false); // Nenhuma indicação encontrada
                        return;
                    }
                    
                    // Calcular comissão
                    const commissionPercentage = config.commission.percentage / 100;
                    const commissionAmount = purchaseAmount * commissionPercentage;
                    
                    // Atualizar comissão na tabela de indicações
                    db.run(
                        'UPDATE referrals SET commission_amount = commission_amount + ? WHERE id = ?',
                        [commissionAmount, referral.id]
                    );
                    
                    // Adicionar comissão ao saldo do referenciador
                    const UserService = require('./userService');
                    await UserService.addCommission(referral.referrer_id, commissionAmount);
                    
                    resolve({
                        referrerId: referral.referrer_id,
                        amount: commissionAmount,
                        percentage: config.commission.percentage
                    });
                }
            );
        });
    }
    
    static async getReferralStats(userId) {
        return new Promise((resolve, reject) => {
            db.get(
                `SELECT 
                    COUNT(*) as total_referrals,
                    COALESCE(SUM(commission_amount), 0) as total_commissions,
                    COALESCE(SUM(CASE WHEN created_at >= datetime('now', '-30 days') THEN commission_amount ELSE 0 END), 0) as monthly_commissions
                FROM referrals 
                WHERE referrer_id = ? AND status = 'active'`,
                [userId],
                (err, stats) => {
                    if (err) reject(err);
                    else resolve(stats || { total_referrals: 0, total_commissions: 0, monthly_commissions: 0 });
                }
            );
        });
    }
    
    static async getReferralList(userId) {
        return new Promise((resolve, reject) => {
            db.all(
                `SELECT r.*, u.phone_number as referred_phone 
                 FROM referrals r 
                 JOIN users u ON r.referred_id = u.id 
                 WHERE r.referrer_id = ? 
                 ORDER BY r.created_at DESC`,
                [userId],
                (err, referrals) => {
                    if (err) reject(err);
                    else resolve(referrals);
                }
            );
        });
    }
    
    static async withdrawCommission(userId, amount) {
        return new Promise((resolve, reject) => {
            db.get(
                'SELECT commission_balance FROM users WHERE id = ?',
                [userId],
                (err, user) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    
                    if (!user || user.commission_balance < amount) {
                        resolve({ success: false, message: 'Saldo de comissão insuficiente' });
                        return;
                    }
                    
                    // Transferir comissão para saldo principal
                    db.run(
                        'UPDATE users SET commission_balance = commission_balance - ?, balance = balance + ? WHERE id = ?',
                        [amount, amount, userId],
                        (err) => {
                            if (err) reject(err);
                            else resolve({ success: true, amount: amount });
                        }
                    );
                }
            );
        });
    }
}

module.exports = ReferralService;
