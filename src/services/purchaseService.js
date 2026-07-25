const { db } = require('../database/init');
const UserService = require('./userService');
const ProductService = require('./productService');
const PDFGenerator = require('../utils/pdfGenerator');

class PurchaseService {
    static async processPurchase(userId, productId) {
        try {
            // Verificar saldo do usuário
            const balance = await UserService.getBalance(userId);
            
            // Buscar produto
            const product = await ProductService.getProductById(productId);
            
            if (!product) {
                return { success: false, message: '❌ Produto não encontrado!' };
            }
            
            if (product.stock <= 0) {
                return { success: false, message: '❌ Produto fora de estoque!' };
            }
            
            if (balance < product.price) {
                return {
                    success: false,
                    message: `❌ *Saldo Insuficiente*\n\nSeu saldo: R$ ${balance.toFixed(2)}\nValor do produto: R$ ${product.price.toFixed(2)}\n\nFaltam: R$ ${(product.price - balance).toFixed(2)}`,
                    insufficientBalance: true
                };
            }
            
            // Gerar credenciais (simulado - você pode integrar com API real)
            const credentials = this.generateCredentials(product);
            
            // Salvar compra no banco
            const purchase = await this.savePurchase(userId, product, credentials);
            
            // Atualizar saldo e estoque
            await UserService.updateBalance(userId, product.price, 'debit');
            await ProductService.decreaseStock(productId);
            
            // Gerar PDF
            const pdfBuffer = await PDFGenerator.generatePurchasePDF({
                userName: userId,
                productName: product.name,
                credentials: credentials,
                purchaseDate: new Date(),
                amount: product.price
            });
            
            return {
                success: true,
                message: '✅ Compra realizada com sucesso!',
                purchase: purchase,
                product: product,
                credentials: credentials,
                pdf: pdfBuffer
            };
            
        } catch (error) {
            console.error('Erro ao processar compra:', error);
            return { success: false, message: '❌ Erro ao processar compra. Tente novamente.' };
        }
    }
    
    static generateCredentials(product) {
        // Simular geração de credenciais
        const randomString = Math.random().toString(36).substring(2, 10);
        return {
            login: `user_${randomString}@${product.name.toLowerCase().replace(/\s/g, '')}.com`,
            password: `Dog${Math.random().toString(36).substring(2, 8)}${Math.floor(Math.random() * 100)}`,
            accessLink: `https://${product.name.toLowerCase().replace(/\s/g, '')}.com/access`,
            expirationDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 dias
        };
    }
    
    static async savePurchase(userId, product, credentials) {
        return new Promise((resolve, reject) => {
            db.run(
                `INSERT INTO purchases (user_id, product_id, product_name, amount, credentials) 
                 VALUES (?, ?, ?, ?, ?)`,
                [userId, product.id, product.name, product.price, JSON.stringify(credentials)],
                function(err) {
                    if (err) reject(err);
                    else resolve({
                        id: this.lastID,
                        userId: userId,
                        productId: product.id,
                        productName: product.name,
                        amount: product.price,
                        credentials: credentials,
                        date: new Date()
                    });
                }
            );
        });
    }
    
    static async getUserPurchases(userId, limit = 10) {
        return new Promise((resolve, reject) => {
            db.all(
                'SELECT * FROM purchases WHERE user_id = ? ORDER BY created_at DESC LIMIT ?',
                [userId, limit],
                (err, purchases) => {
                    if (err) reject(err);
                    else resolve(purchases);
                }
            );
        });
    }
    
    static async getPurchaseById(purchaseId) {
        return new Promise((resolve, reject) => {
            db.get('SELECT * FROM purchases WHERE id = ?', [purchaseId], (err, purchase) => {
                if (err) reject(err);
                else resolve(purchase);
            });
        });
    }
    
    static formatPurchaseConfirmation(product, credentials) {
        return `✅ *COMPRA CONFIRMADA*\n\n` +
               `📦 Produto: ${product.name}\n` +
               `💰 Valor: R$ ${product.price.toFixed(2)}\n\n` +
               `🔐 *CREDENCIAIS DE ACESSO:*\n` +
               `📧 Login: \`${credentials.login}\`\n` +
               `🔑 Senha: \`${credentials.password}\`\n\n` +
               `🔗 Link: ${credentials.accessLink}\n` +
               `📅 Vencimento: ${credentials.expirationDate.toLocaleDateString('pt-BR')}\n\n` +
               `_Guarde suas credenciais em local seguro!_`;
    }
}

module.exports = PurchaseService;
