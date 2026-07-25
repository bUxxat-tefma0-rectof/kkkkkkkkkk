const MessageService = require('./messageService');
const UserService = require('./userService');
const PixService = require('./pixService');
const ProductService = require('./productService');
const PurchaseService = require('./purchaseService');
const ReferralService = require('./referralService');
const AdminService = require('./adminService');

class MenuHandler {
    constructor(client) {
        this.client = client;
        this.userStates = new Map(); // Armazenar estado do usuário
    }

    async handleMainMenu(message, user) {
        const balance = await UserService.getBalance(user.id);
        user.balance = balance;
        
        await message.reply(MessageService.getWelcomeMessage(user));
        
        // Enviar opções do menu principal
        const menuOptions = 
            `*MENU PRINCIPAL*\n\n` +
            `1️⃣ 💸 Adicionar Saldo\n` +
            `2️⃣ 🛍️ Assinaturas Premium\n` +
            `3️⃣ 💼 Área do Associado\n` +
            `4️⃣ 👤 Contato do Suporte\n\n` +
            `_Digite o número da opção desejada_`;
        
        await message.reply(menuOptions);
        this.userStates.set(user.id, { state: 'main_menu' });
    }

    async handlePixMenu(message, user) {
        await message.reply(MessageService.getPixMenuMessage());
        this.userStates.set(user.id, { state: 'pix_menu' });
    }

    async handlePixValue(message, user, value) {
        try {
            await message.reply('⏳ *Gerando PIX...*');
            
            const pixData = await PixService.generatePix(user.id, value);
            
            // Enviar QR Code como imagem
            if (pixData.qrCode) {
                const base64Data = pixData.qrCode.replace(/^data:image\/png;base64,/, '');
                const buffer = Buffer.from(base64Data, 'base64');
                await message.reply(buffer, { caption: '📱 QR Code PIX' });
            }
            
            // Enviar código PIX
            await message.reply(MessageService.getPixGeneratedMessage(pixData));
            
            // Iniciar verificação de pagamento
            this.startPaymentCheck(message, user, pixData.pixId);
            
            this.userStates.set(user.id, { state: 'awaiting_payment', pixId: pixData.pixId });
            
        } catch (error) {
            await message.reply(`❌ Erro ao gerar PIX: ${error.message}`);
        }
    }

    async startPaymentCheck(message, user, pixId) {
        const checkInterval = setInterval(async () => {
            try {
                const result = await PixService.checkPaymentStatus(pixId);
                
                if (result.status === 'approved') {
                    clearInterval(checkInterval);
                    const newBalance = await UserService.getBalance(user.id);
                    await message.reply(MessageService.getPaymentConfirmedMessage(
                        result.payment.transaction_amount,
                        newBalance
                    ));
                    this.userStates.delete(user.id);
                } else if (result.status === 'rejected') {
                    clearInterval(checkInterval);
                    await message.reply('❌ Pagamento rejeitado. Tente novamente.');
                    this.userStates.delete(user.id);
                }
            } catch (error) {
                console.error('Erro ao verificar pagamento:', error);
            }
        }, 10000); // Verificar a cada 10 segundos

        // Parar verificação após 30 minutos
        setTimeout(() => {
            clearInterval(checkInterval);
            if (this.userStates.get(user.id)?.state === 'awaiting_payment') {
                this.userStates.delete(user.id);
            }
        }, 30 * 60 * 1000);
    }

    async handleCatalog(message, user) {
        const balance = await UserService.getBalance(user.id);
        user.balance = balance;
        
        const products = await ProductService.getAvailableProducts();
        
        await message.reply(MessageService.getCatalogMessage(user, products));
        this.userStates.set(user.id, { state: 'catalog', page: 1 });
    }

    async handleProductSelection(message, user, productIndex) {
        const products = await ProductService.getAvailableProducts();
        
        if (productIndex > 0 && productIndex <= products.length) {
            const product = products[productIndex - 1];
            
            await message.reply(MessageService.getProductDetailMessage(product));
            this.userStates.set(user.id, { 
                state: 'product_detail', 
                productId: product.id 
            });
        } else {
            await message.reply('❌ Produto não encontrado!');
        }
    }

    async handlePurchaseConfirmation(message, user) {
        const userState = this.userStates.get(user.id);
        
        if (!userState || !userState.productId) {
            await message.reply('❌ Nenhum produto selecionado!');
            return;
        }

        const result = await PurchaseService.processPurchase(user.id, userState.productId);
        
        if (result.success) {
            // Enviar confirmação
            await message.reply(MessageService.getPurchaseSuccessMessage(
                result.product, 
                result.credentials
            ));
            
            // Enviar PDF
            if (result.pdf) {
                await message.reply(result.pdf, { 
                    filename: `compra_${result.purchase.id}.pdf`,
                    caption: '📄 Comprovante da Compra' 
                });
            }
            
            this.userStates.delete(user.id);
            
        } else if (result.insufficientBalance) {
            await message.reply(MessageService.getInsufficientBalanceMessage(
                await UserService.getBalance(user.id),
                result.product?.price || 0
            ));
        } else {
            await message.reply(result.message);
        }
    }

    async handleAffiliateArea(message, user) {
        const stats = await ReferralService.getReferralStats(user.id);
        await message.reply(MessageService.getAffiliateMessage(user, stats));
        this.userStates.set(user.id, { state: 'affiliate_area' });
    }

    async handleReferralText(message, user) {
        const botNumber = (await this.client.info.me).user;
        const referralText = MessageService.getReferralTextMessage(
            botNumber,
            user.referral_link,
            user.referral_code
        );
        
        await message.reply(referralText);
        this.userStates.set(user.id, { state: 'affiliate_area' });
    }

    async handleWithdrawCommission(message, user) {
        const stats = await ReferralService.getReferralStats(user.id);
        
        if (stats.total_commissions <= 0) {
            await message.reply('❌ Você não possui comissões para sacar!');
            return;
        }
        
        const result = await ReferralService.withdrawCommission(user.id, stats.total_commissions);
        
        if (result.success) {
            const newBalance = await UserService.getBalance(user.id);
            await message.reply(
                `✅ *COMISSÃO SACADA!*\n\n` +
                `💰 Valor: R$ ${result.amount.toFixed(2)}\n` +
                `💵 Novo saldo: R$ ${newBalance.toFixed(2)}`
            );
        } else {
            await message.reply(`❌ ${result.message}`);
        }
        
        this.userStates.set(user.id, { state: 'affiliate_area' });
    }

    async handleSupport(message, user) {
        await message.reply(MessageService.getSupportMessage());
        this.userStates.set(user.id, { state: 'main_menu' });
    }

    async handleAdminPanel(message, user) {
        const isAdmin = await AdminService.isAdmin(user.phone_number);
        
        if (!isAdmin) {
            await message.reply('❌ Acesso negado!');
            return;
        }
        
        await message.reply(MessageService.getAdminPanelMessage());
        this.userStates.set(user.id, { state: 'admin_panel' });
    }

    async handleAdminProductManagement(message, user) {
        await message.reply(MessageService.getProductManagementMessage());
        this.userStates.set(user.id, { state: 'admin_products' });
    }

    async handleBroadcast(message, user) {
        const isAdmin = await AdminService.isAdmin(user.phone_number);
        
        if (!isAdmin) {
            await message.reply('❌ Acesso negado!');
            return;
        }
        
        await message.reply(MessageService.getBroadcastMessage());
        this.userStates.set(user.id, { state: 'awaiting_broadcast' });
    }

    async executeBroadcast(message, user) {
        const isAdmin = await AdminService.isAdmin(user.phone_number);
        
        if (!isAdmin) return;
        
        await message.reply('📤 Enviando mensagem para todos os usuários...');
        
        const result = await AdminService.broadcastMessage(message.body, this.client);
        
        await message.reply(
            `✅ *TRANSMISSÃO CONCLUÍDA*\n\n` +
            `📤 Enviadas: ${result.sent}\n` +
            `❌ Falhas: ${result.failed}\n` +
            `📊 Total: ${result.total}`
        );
        
        this.userStates.set(user.id, { state: 'admin_panel' });
    }

    async handleAdminDashboard(message, user) {
        const isAdmin = await AdminService.isAdmin(user.phone_number);
        
        if (!isAdmin) {
            await message.reply('❌ Acesso negado!');
            return;
        }
        
        const stats = await AdminService.getDashboardStats();
        
        const dashboardMessage = 
            `📊 *DASHBOARD ADMINISTRATIVO*\n\n` +
            `👥 *Usuários:* ${stats.totalUsers}\n` +
            `🛍️ *Vendas Hoje:* ${stats.todaySales}\n` +
            `💰 *Faturamento Hoje:* R$ ${stats.todayRevenue.toFixed(2)}\n` +
            `📈 *Total Vendas:* ${stats.totalSales}\n` +
            `💵 *Faturamento Total:* R$ ${stats.totalRevenue.toFixed(2)}\n` +
            `💳 *Recargas:* ${stats.totalRecharges}\n\n` +
            `🏆 *TOP 5 PRODUTOS:*\n`;
        
        if (stats.topProducts && stats.topProducts.length > 0) {
            stats.topProducts.forEach((product, index) => {
                dashboardMessage += `${index + 1}️⃣ ${product.product_name}: ${product.sales_count} vendas\n`;
            });
        }
        
        await message.reply(dashboardMessage);
        this.userStates.set(user.id, { state: 'admin_panel' });
    }

    getUserState(userId) {
        return this.userStates.get(userId);
    }

    clearUserState(userId) {
        this.userStates.delete(userId);
    }
}

module.exports = MenuHandler;
