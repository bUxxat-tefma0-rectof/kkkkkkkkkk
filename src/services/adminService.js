const { db } = require('../database/init');
const config = require('../config/settings');

class AdminService {
    static async isAdmin(phoneNumber) {
        return phoneNumber === config.bot.adminNumber;
    }

    // ============ DASHBOARD ============
    static async getDashboardStats() {
        return new Promise((resolve, reject) => {
            const stats = {};
            
            db.serialize(() => {
                db.get('SELECT COUNT(*) as total FROM users', [], (err, row) => {
                    if (!err) stats.totalUsers = row.total;
                });
                
                db.get('SELECT COUNT(*) as total, COALESCE(SUM(amount), 0) as revenue FROM purchases', [], (err, row) => {
                    if (!err) {
                        stats.totalSales = row.total;
                        stats.totalRevenue = row.revenue;
                    }
                });
                
                db.get("SELECT COUNT(*) as total, COALESCE(SUM(amount), 0) as revenue FROM purchases WHERE date(created_at) = date('now')", [], (err, row) => {
                    if (!err) {
                        stats.todaySales = row.total;
                        stats.todayRevenue = row.revenue;
                    }
                });
                
                db.get("SELECT COUNT(*) as total, COALESCE(SUM(amount), 0) as total_amount FROM pix_recharges WHERE status = 'completed'", [], (err, row) => {
                    if (!err) {
                        stats.totalRecharges = row.total;
                        stats.totalRechargeAmount = row.total_amount;
                    }
                });
                
                db.all(`SELECT product_name, COUNT(*) as sales_count, SUM(amount) as total_revenue 
                        FROM purchases GROUP BY product_name ORDER BY sales_count DESC LIMIT 5`, [], (err, rows) => {
                    if (!err) stats.topProducts = rows;
                    resolve(stats);
                });
            });
        });
    }

    // ============ PRODUTOS ============
    static async addProduct(data) {
        return new Promise((resolve, reject) => {
            const { name, price, stock, category, description } = data;
            db.run(
                'INSERT INTO products (name, price, stock, category, description) VALUES (?, ?, ?, ?, ?)',
                [name, price, stock, category, description || ''],
                function(err) {
                    if (err) reject(err);
                    else resolve({ id: this.lastID, ...data });
                }
            );
        });
    }

    static async removeProduct(productId) {
        return new Promise((resolve, reject) => {
            db.run('UPDATE products SET active = 0 WHERE id = ?', [productId], (err) => {
                if (err) reject(err);
                else resolve(true);
            });
        });
    }

    static async editProduct(productId, updates) {
        return new Promise((resolve, reject) => {
            const allowed = ['name', 'price', 'stock', 'category', 'description', 'active'];
            const sets = [];
            const values = [];
            
            Object.keys(updates).forEach(key => {
                if (allowed.includes(key)) {
                    sets.push(`${key} = ?`);
                    values.push(updates[key]);
                }
            });
            
            if (sets.length === 0) {
                resolve(false);
                return;
            }
            
            values.push(productId);
            db.run(`UPDATE products SET ${sets.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, values, (err) => {
                if (err) reject(err);
                else resolve(true);
            });
        });
    }

    static async updateStock(productId, quantity) {
        return new Promise((resolve, reject) => {
            db.run('UPDATE products SET stock = stock + ? WHERE id = ?', [quantity, productId], (err) => {
                if (err) reject(err);
                else resolve(true);
            });
        });
    }

    static async listAllProducts() {
        return new Promise((resolve, reject) => {
            db.all('SELECT * FROM products ORDER BY id DESC', [], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }

    // ============ USUÁRIOS ============
    static async listUsers(page = 1, limit = 20) {
        return new Promise((resolve, reject) => {
            const offset = (page - 1) * limit;
            db.all('SELECT * FROM users ORDER BY created_at DESC LIMIT ? OFFSET ?', [limit, offset], (err, users) => {
                if (err) reject(err);
                else {
                    db.get('SELECT COUNT(*) as total FROM users', [], (err, count) => {
                        if (err) reject(err);
                        else resolve({ users, total: count.total, page });
                    });
                }
            });
        });
    }

    static async getUserByPhone(phone) {
        return new Promise((resolve, reject) => {
            db.get('SELECT * FROM users WHERE phone_number = ?', [phone], (err, user) => {
                if (err) reject(err);
                else resolve(user);
            });
        });
    }

    // ============ COMPRAS ============
    static async listPurchases(limit = 50) {
        return new Promise((resolve, reject) => {
            db.all(`SELECT p.*, u.phone_number FROM purchases p 
                    JOIN users u ON p.user_id = u.id 
                    ORDER BY p.created_at DESC LIMIT ?`, [limit], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }

    // ============ RECARGAS ============
    static async listRecharges(limit = 50) {
        return new Promise((resolve, reject) => {
            db.all(`SELECT pr.*, u.phone_number FROM pix_recharges pr 
                    JOIN users u ON pr.user_id = u.id 
                    ORDER BY pr.created_at DESC LIMIT ?`, [limit], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }

    // ============ CONFIGURAÇÕES ============
    static async getSetting(key) {
        return new Promise((resolve, reject) => {
            db.get('SELECT value FROM settings WHERE key = ?', [key], (err, row) => {
                if (err) reject(err);
                else resolve(row ? row.value : null);
            });
        });
    }

    static async setSetting(key, value) {
        return new Promise((resolve, reject) => {
            db.run('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)', [key, value], (err) => {
                if (err) reject(err);
                else resolve(true);
            });
        });
    }

    static async getAllSettings() {
        return new Promise((resolve, reject) => {
            db.all('SELECT * FROM settings', [], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }

    // ============ BROADCAST ============
    static async broadcastMessage(message, sock) {
        return new Promise((resolve, reject) => {
            db.all('SELECT phone_number FROM users', [], async (err, users) => {
                if (err) { reject(err); return; }
                
                let sent = 0, failed = 0;
                
                for (const user of users) {
                    try {
                        const jid = `${user.phone_number}@s.whatsapp.net`;
                        await sock.sendMessage(jid, { text: message });
                        sent++;
                        await new Promise(r => setTimeout(r, 2000));
                    } catch (error) {
                        failed++;
                    }
                }
                
                resolve({ sent, failed, total: users.length });
            });
        });
    }

    // ============ LOGS ============
    static async addLog(type, userId, message) {
        return new Promise((resolve, reject) => {
            db.run('INSERT INTO logs (type, user_id, message) VALUES (?, ?, ?)', [type, userId, message], (err) => {
                if (err) reject(err);
                else resolve(true);
            });
        });
    }

    static async getLogs(limit = 100) {
        return new Promise((resolve, reject) => {
            db.all('SELECT * FROM logs ORDER BY created_at DESC LIMIT ?', [limit], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }
}

module.exports = AdminService;
