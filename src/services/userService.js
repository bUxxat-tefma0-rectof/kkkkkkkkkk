const { getDatabase, saveDatabase } = require('../database/init');

class UserService {
    static getDb() {
        return getDatabase();
    }

    static async getOrCreateUser(phoneNumber) {
        const db = this.getDb();
        
        let stmt = db.prepare('SELECT * FROM users WHERE phone_number = ?');
        stmt.bind([phoneNumber]);
        
        let user = null;
        if (stmt.step()) {
            user = stmt.getAsObject();
        }
        stmt.free();
        
        if (user) return user;
        
        const referralCode = this.generateReferralCode(phoneNumber);
        const referralLink = `https://wa.me/SEU_NUMERO?text=${referralCode}`;
        
        db.run('INSERT INTO users (phone_number, referral_code, referral_link) VALUES (?, ?, ?)', [phoneNumber, referralCode, referralLink]);
        
        const dbPath = process.env.DB_PATH || './database/store.db';
        saveDatabase(dbPath);
        
        stmt = db.prepare('SELECT * FROM users WHERE phone_number = ?');
        stmt.bind([phoneNumber]);
        if (stmt.step()) {
            user = stmt.getAsObject();
        }
        stmt.free();
        
        return user;
    }

    static generateReferralCode(phoneNumber) {
        const cleanNumber = phoneNumber.replace(/\D/g, '');
        const random = Math.random().toString(36).substring(2, 6).toUpperCase();
        return `DOG${cleanNumber.slice(-4)}${random}`;
    }

    static async getBalance(userId) {
        const db = this.getDb();
        const stmt = db.prepare('SELECT balance FROM users WHERE id = ?');
        stmt.bind([userId]);
        
        let balance = 0;
        if (stmt.step()) {
            balance = stmt.getAsObject().balance || 0;
        }
        stmt.free();
        
        return balance;
    }

    static async updateBalance(userId, amount, type = 'credit') {
        const db = this.getDb();
        const currentBalance = await this.getBalance(userId);
        
        let newBalance;
        if (type === 'credit') {
            newBalance = currentBalance + amount;
        } else {
            newBalance = currentBalance - amount;
            if (newBalance < 0) throw new Error('Saldo insuficiente');
        }
        
        db.run('UPDATE users SET balance = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [newBalance, userId]);
        
        const dbPath = process.env.DB_PATH || './database/store.db';
        saveDatabase(dbPath);
        
        return true;
    }

    static async addCommission(userId, amount) {
        const db = this.getDb();
        db.run('UPDATE users SET commission_balance = commission_balance + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [amount, userId]);
        
        const dbPath = process.env.DB_PATH || './database/store.db';
        saveDatabase(dbPath);
        
        return true;
    }

    static async getUserStats(userId) {
        const db = this.getDb();
        const stmt = db.prepare(`
            SELECT 
                u.*,
                COUNT(r.id) as total_referrals,
                COALESCE(SUM(r.commission_amount), 0) as total_commissions
            FROM users u
            LEFT JOIN referrals r ON u.id = r.referrer_id
            WHERE u.id = ?
            GROUP BY u.id
        `);
        stmt.bind([userId]);
        
        let stats = null;
        if (stmt.step()) {
            stats = stmt.getAsObject();
        }
        stmt.free();
        
        return stats || { total_referrals: 0, total_commissions: 0 };
    }
}

module.exports = UserService;
