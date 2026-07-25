const { db } = require('../database/init');

class ProductService {
    static async getAvailableProducts(category = null) {
        return new Promise((resolve, reject) => {
            let query = 'SELECT * FROM products WHERE active = 1 AND stock > 0';
            const params = [];
            
            if (category) {
                query += ' AND category = ?';
                params.push(category);
            }
            
            query += ' ORDER BY name ASC';
            
            db.all(query, params, (err, products) => {
                if (err) reject(err);
                else resolve(products);
            });
        });
    }

    static async getProductById(productId) {
        return new Promise((resolve, reject) => {
            db.get('SELECT * FROM products WHERE id = ?', [productId], (err, product) => {
                if (err) reject(err);
                else resolve(product);
            });
        });
    }

    static async decreaseStock(productId, quantity = 1) {
        return new Promise((resolve, reject) => {
            db.run(
                'UPDATE products SET stock = stock - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND stock >= ?',
                [quantity, productId, quantity],
                (err) => {
                    if (err) reject(err);
                    else resolve(true);
                }
            );
        });
    }

    static async increaseStock(productId, quantity = 1) {
        return new Promise((resolve, reject) => {
            db.run(
                'UPDATE products SET stock = stock + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                [quantity, productId],
                (err) => {
                    if (err) reject(err);
                    else resolve(true);
                }
            );
        });
    }

    static async addProduct(productData) {
        return new Promise((resolve, reject) => {
            const { name, description, price, stock, category } = productData;
            
            db.run(
                `INSERT INTO products (name, description, price, stock, category) 
                 VALUES (?, ?, ?, ?, ?)`,
                [name, description, price, stock, category],
                function(err) {
                    if (err) reject(err);
                    else resolve({ id: this.lastID, ...productData });
                }
            );
        });
    }

    static async updateProduct(productId, updates) {
        return new Promise((resolve, reject) => {
            const allowedUpdates = ['name', 'description', 'price', 'stock', 'category', 'active'];
            const setClauses = [];
            const values = [];
            
            Object.keys(updates).forEach(key => {
                if (allowedUpdates.includes(key)) {
                    setClauses.push(`${key} = ?`);
                    values.push(updates[key]);
                }
            });
            
            if (setClauses.length === 0) {
                resolve(false);
                return;
            }
            
            setClauses.push('updated_at = CURRENT_TIMESTAMP');
            values.push(productId);
            
            db.run(
                `UPDATE products SET ${setClauses.join(', ')} WHERE id = ?`,
                values,
                (err) => {
                    if (err) reject(err);
                    else resolve(true);
                }
            );
        });
    }

    static async deleteProduct(productId) {
        return new Promise((resolve, reject) => {
            db.run(
                'UPDATE products SET active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                [productId],
                (err) => {
                    if (err) reject(err);
                    else resolve(true);
                }
            );
        });
    }

    static async getProductsByCategory() {
        return new Promise((resolve, reject) => {
            db.all(
                'SELECT category, COUNT(*) as count FROM products WHERE active = 1 GROUP BY category',
                [],
                (err, categories) => {
                    if (err) reject(err);
                    else resolve(categories);
                }
            );
        });
    }

    static async searchProducts(searchTerm) {
        return new Promise((resolve, reject) => {
            db.all(
                'SELECT * FROM products WHERE name LIKE ? AND active = 1',
                [`%${searchTerm}%`],
                (err, products) => {
                    if (err) reject(err);
                    else resolve(products);
                }
            );
        });
    }

    static async getLowStockProducts(threshold = 5) {
        return new Promise((resolve, reject) => {
            db.all(
                'SELECT * FROM products WHERE active = 1 AND stock <= ? ORDER BY stock ASC',
                [threshold],
                (err, products) => {
                    if (err) reject(err);
                    else resolve(products);
                }
            );
        });
    }
}

module.exports = ProductService;
