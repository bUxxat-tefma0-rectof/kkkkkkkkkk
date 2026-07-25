const { db } = require('../database/init');

class UserService {
    static async getOrCreateUser(phoneNumber) {
        return new Promise((resolve, reject) => {
            db.get('SELECT * FROM users WHERE phone_number = ?', [phoneNumber], (err, user) => {
                if (err) {
                    reject(err);
                    return;
                }
                
                if (user) {
                    resolve(user);
                } else {
                    // Criar novo usuário
                    const referralCode = this.generateReferralCode(phoneNumber);
                    const referralLink = `https://wa.me/SEU_NUMERO_BOT?text=${referralCode}`;
                    
                    db.run(
                        'INSERT INTO users (phone_number, referral_code, referral_link) VALUES (?, ?, ?)',
                        [phoneNumber, referralCode, referralLink],
                        function(err) {
                            if (err) {
                                reject(err);
                                return;
                            }
                            
                            resolve({
                                id: this.lastID,
                                phone_number: phoneNumber,
                                balance: 0,
                                referral_code: referralCode,
                                referral_link: referralLink,
                                commission_balance: 0,
                                total_referrals: 0
                            });
                        }
                    );
                }
            });
        });
    }

    static generateReferralCode(phoneNumber) {
        const cleanNumber = phoneNumber.replace(/\D/g, '');
        const random = Math.random().toString(36).substring(2, 6).toUpperCase();
        return `DOG${cleanNumber.slice(-4)}${random}`;
    }

    static async getBalance(userId) {
        return new Promise((resolve, reject) => {
            db.get('SELECT balance FROM users WHERE id = ?', [userId], (err, row) => {
                if (err) reject(err);
                else resolve(row ? row.balance : 0);
            });
        });
    }

    static async updateBalance(userId, amount, type = 'credit') {
        return new Promise((resolve, reject) => {
            const operation = type === 'credit' ? '+' : '-';
            db.run(
                `UPDATE users SET balance = balance ${operation} ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
                [amount, userId],
                (err) => {
                    if (err) reject(err);
                    else resolve(true);
                }
            );
        });
    }

    static async addCommission(userId, amount) {
        return new Promise((resolve, reject) => {
            db.run(
                'UPDATE users SET commission_balance = commission_balance + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                [amount, userId],
                (err) => {
                    if (err) reject(err);
                    else resolve(true);
                }
            );
        });
    }

    static async getUserStats(userId) {
        return new Promise((resolve, reject) => {
            db.get(
                `SELECT 
                    u.*,
                    COUNT(r.id) as total_referrals,
                    COALESCE(SUM(r.commission_amount), 0) as total_commissions
                FROM users u
                LEFT JOIN referrals r ON u.id = r.referrer_id
                WHERE u.id = ?
                GROUP BY u.id`,
                [userId],
                (err, stats) => {
                    if (err) reject(err);
                    else resolve(stats);
                }
            );
        });
    }
}

module.exports = UserService;
