const { db } = require('../database/init');
const config = require('../config/settings');

class AdminService {
    static async isAdmin(phoneNumber) {
        return phoneNumber === config.bot.adminNumber;
    }
    
    static async getDashboardStats() {
        return new Promise((resolve, reject) => {
            const stats = {};
            
            db.serialize(() => {
                // Total de usuários
                db.get('SELECT COUNT(*) as total FROM users', [], (err, row) => {
                    if (!err) stats.totalUsers = row.total;
                });
                
                // Total de vendas
                db.get('SELECT COUNT(*) as total, COALESCE(SUM(amount), 0) as revenue FROM purchases', [], (err, row) => {
                    if (!err) {
                        stats.totalSales = row.total;
                        stats.totalRevenue = row.revenue;
                    }
                });
                
                // Vendas hoje
                db.get(
                    "SELECT COUNT(*) as total, COALESCE(SUM(amount), 0) as revenue FROM purchases WHERE date(created_at) = date('now')",
                    [],
                    (err, row) => {
                        if (!err) {
                            stats.todaySales = row.total;
                            stats.todayRevenue = row.revenue;
                        }
                    }
                );
                
                // Total de recargas
                db.get(
                    "SELECT COUNT(*) as total, COALESCE(SUM(amount), 0) as total_amount FROM pix_recharges WHERE status = 'completed'",
                    [],
                    (err, row) => {
                        if (!err) {
                            stats.totalRecharges = row.total;
                            stats.totalRechargeAmount = row.total_amount;
                        }
                    }
                );
                
                // Produtos mais vendidos
                db.all(
                    `SELECT product_name, COUNT(*) as sales_count, SUM(amount) as total_revenue 
                     FROM purchases 
                     GROUP BY product_name 
                     ORDER BY sales_count DESC 
                     LIMIT 5`,
                    [],
                    (err, rows) => {
                        if (!err) stats.topProducts = rows;
                        resolve(stats);
                    }
                );
            });
        });
    }
    
    static async getRecentPurchases(limit = 20) {
        return new Promise((resolve, reject) => {
            db.all(
                `SELECT p.*, u.phone_number 
                 FROM purchases p 
                 JOIN users u ON p.user_id = u.id 
                 ORDER BY p.created_at DESC 
                 LIMIT ?`,
                [limit],
                (err, purchases) => {
                    if (err) reject(err);
                    else resolve(purchases);
                }
            );
        });
    }
    
    static async getRecentRecharges(limit = 20) {
        return new Promise((resolve, reject) => {
            db.all(
                `SELECT pr.*, u.phone_number 
                 FROM pix_recharges pr 
                 JOIN users u ON pr.user_id = u.id 
                 ORDER BY pr.created_at DESC 
                 LIMIT ?`,
                [limit],
                (err, recharges) => {
                    if (err) reject(err);
                    else resolve(recharges);
                }
            );
        });
    }
    
    static async getAllUsers(page = 1, limit = 50) {
        return new Promise((resolve, reject) => {
            const offset = (page - 1) * limit;
            
            db.all(
                `SELECT u.*, 
                    COUNT(DISTINCT p.id) as total_purchases,
                    COALESCE(SUM(p.amount), 0) as total_spent
                 FROM users u
                 LEFT JOIN purchases p ON u.id = p.user_id
                 GROUP BY u.id
                 ORDER BY u.created_at DESC
                 LIMIT ? OFFSET ?`,
                [limit, offset],
                (err, users) => {
                    if (err) reject(err);
                    else {
                        db.get('SELECT COUNT(*) as total FROM users', [], (err, count) => {
                            if (err) reject(err);
                            else resolve({
                                users: users,
                                total: count.total,
                                page: page,
                                totalPages: Math.ceil(count.total / limit)
                            });
                        });
                    }
                }
            );
        });
    }
    
    static async updateSetting(key, value) {
        return new Promise((resolve, reject) => {
            db.run(
                `INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)`,
                [key, value],
                (err) => {
                    if (err) reject(err);
                    else resolve(true);
                }
            );
        });
    }
    
    static async getSetting(key) {
        return new Promise((resolve, reject) => {
            db.get('SELECT value FROM settings WHERE key = ?', [key], (err, row) => {
                if (err) reject(err);
                else resolve(row ? row.value : null);
            });
        });
    }
    
    static async broadcastMessage(message, client) {
        return new Promise((resolve, reject) => {
            db.all('SELECT phone_number FROM users', [], async (err, users) => {
                if (err) {
                    reject(err);
                    return;
                }
                
                let sentCount = 0;
                let failCount = 0;
                
                for (const user of users) {
                    try {
                        await client.sendMessage(`${user.phone_number}@c.us`, message);
                        sentCount++;
                        // Pequena pausa para evitar bloqueio
                        await new Promise(r => setTimeout(r, 1000));
                    } catch (error) {
                        failCount++;
                        console.error(`Erro ao enviar para ${user.phone_number}:`, error);
                    }
                }
                
                resolve({ sent: sentCount, failed: failCount, total: users.length });
            });
        });
    }
    
    static async getLogs(type = null, limit = 100) {
        return new Promise((resolve, reject) => {
            let query = 'SELECT * FROM logs';
            const params = [];
            
            if (type) {
                query += ' WHERE type = ?';
                params.push(type);
            }
            
            query += ' ORDER BY created_at DESC LIMIT ?';
            params.push(limit);
            
            db.all(query, params, (err, logs) => {
                if (err) reject(err);
                else resolve(logs);
            });
        });
    }
    
    static async addLog(type, userId, message) {
        return new Promise((resolve, reject) => {
            db.run(
                'INSERT INTO logs (type, user_id, message) VALUES (?, ?, ?)',
                [type, userId, message],
                (err) => {
                    if (err) reject(err);
                    else resolve(true);
                }
            );
        });
    }
}

module.exports = AdminService;
