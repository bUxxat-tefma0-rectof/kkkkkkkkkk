const InteractiveListService = require('../services/interactiveListService');
const MessageService = require('../services/messageService');
const UserService = require('../services/userService');
const PixService = require('../services/pixService');
const ProductService = require('../services/productService');
const PurchaseService = require('../services/purchaseService');
const ReferralService = require('../services/referralService');
const AdminService = require('../services/adminService');

class InteractiveHandler {
    constructor(client) {
        this.client = client;
    }

    async processListResponse(message, selectedId, user) {
        const phoneNumber = message.from.replace('@c.us', '');

        // MENU PRINCIPAL
        if (selectedId === 'menu_add_balance') {
            await this.showPixMenu(message, user);
        }
        else if (selectedId === 'menu_products') {
            await this.showCatalog(message, user);
        }
        else if (selectedId === 'menu_affiliate') {
            await this.showAffiliateArea(message, user);
        }
        else if (selectedId === 'menu_support') {
            await this.showSupport(message);
        }
        
        // PIX
        else if (selectedId === 'pix_5') {
            await this.processPixPayment(message, user, 5);
        }
        else if (selectedId === 'pix_8') {
            await this.processPixPayment(message, user, 8);
        }
        else if (selectedId === 'pix_20') {
            await this.processPixPayment(message, user, 20);
        }
        else if (selectedId === 'pix_custom') {
            await message.reply('💎 *Digite o valor desejado para recarga:*\n\n_Exemplo: 50 (para R$ 50,00)_');
        }
        
        // VOLTAR
        else if (selectedId === 'menu_back') {
            await this.showMainMenu(message, user);
        }
        
        // PRODUTOS
        else if (selectedId.startsWith('product_')) {
            const productId = selectedId.replace('product_', '');
            await this.showProductDetail(message, user, productId);
        }
        else if (selectedId.startsWith('catalog_page_')) {
            const page = parseInt(selectedId.replace('catalog_page_', ''));
            await this.showCatalog(message, user, page);
        }
        
        // COMPRA
        else if (selectedId === 'confirm_purchase') {
            await this.confirmPurchase(message, user);
        }
        else if (selectedId === 'cancel_purchase') {
            await message.reply('❌ Compra cancelada.');
            await this.showMainMenu(message, user);
        }
        
        // AFILIADO
        else if (selectedId === 'affiliate_text') {
            await this.sendReferralText(message, user);
        }
        else if (selectedId === 'affiliate_withdraw') {
            await this.withdrawCommission(message, user);
        }
        
        // ADMIN
        else if (selectedId.startsWith('admin_')) {
            await this.processAdminAction(message, user, selectedId);
        }
    }

    async showMainMenu(message, user) {
        const balance = await UserService.getBalance(user.id);
        const mainMenuList = InteractiveListService.getMainMenuList(user.phone_number, balance);
        await message.reply(mainMenuList);
    }

    async showPixMenu(message, user) {
        const pixMenuList = InteractiveListService.getPixMenuList();
        await message.reply(pixMenuList);
    }

    async showCatalog(message, user, page = 1) {
        const balance = await UserService.getBalance(user.id);
        const products = await ProductService.getAvailableProducts();
        
        // Mensagem do cabeçalho
        const headerMsg = `🛍️ *ASSINATURAS PREMIUM*\n\n` +
                         `👤 *Grupo:* Clientes VIP\n` +
                         `📱 *Número:* ${user.phone_number}\n` +
                         `💰 *Saldo:* R$ ${balance.toFixed(2)}\n\n` +
                         `_Escolha um produto abaixo:_`;
        
        await message.reply(headerMsg);
        
        // Lista interativa de produtos
        const catalogList = InteractiveListService.getProductCatalogList(products, page);
        await message.reply(catalogList);
    }

    async showProductDetail(message, user, productId) {
        const product = await ProductService.getProductById(productId);
        const balance = await UserService.getBalance(user.id);
        
        if (!product) {
            await message.reply('❌ Produto não encontrado!');
            return;
        }
        
        if (balance < product.price) {
            await message.reply(MessageService.getInsufficientBalanceMessage(balance, product.price));
            return;
        }
        
        // Salvar produto selecionado para o usuário
        global.selectedProducts = global.selectedProducts || new Map();
        global.selectedProducts.set(user.id, productId);
        
        const detailMsg = `📦 *${product.name}*\n\n` +
                         `💰 *Valor:* R$ ${product.price.toFixed(2)}\n` +
                         `📦 *Estoque:* ${product.stock} unidades\n` +
                         `📝 *Descrição:* ${product.description || 'Acesso premium'}\n\n` +
                         `*Deseja confirmar a compra?*`;
        
        await message.reply(detailMsg);
        
        // Botões de confirmação
        const buttons = InteractiveListService.getPurchaseConfirmationButtons();
        await message.reply(buttons);
    }

    async confirmPurchase(message, user) {
        const productId = global.selectedProducts?.get(user.id);
        
        if (!productId) {
            await message.reply('❌ Nenhum produto selecionado!');
            return;
        }
        
        const result = await PurchaseService.processPurchase(user.id, productId);
        
        if (result.success) {
            await message.reply(MessageService.getPurchaseSuccessMessage(result.product, result.credentials));
            
            if (result.pdf) {
                await message.reply(result.pdf, {
                    filename: `compra_${result.purchase.id}.pdf`,
                    caption: '📄 Comprovante da Compra'
                });
            }
            
            global.selectedProducts.delete(user.id);
            
        } else {
            await message.reply(result.message);
        }
    }

    async processPixPayment(message, user, amount) {
        try {
            await message.reply('⏳ *Gerando PIX...*');
            
            const pixData = await PixService.generatePix(user.id, amount);
            
            // Enviar QR Code
            if (pixData.qrCode) {
                const base64Data = pixData.qrCode.replace(/^data:image\/png;base64,/, '');
                const buffer = Buffer.from(base64Data, 'base64');
                await message.reply(buffer, { caption: '📱 QR Code PIX' });
            }
            
            await message.reply(MessageService.getPixGeneratedMessage(pixData));
            
            // Iniciar verificação automática
            this.startPaymentVerification(message, user, pixData.pixId);
            
        } catch (error) {
            await message.reply(`❌ Erro: ${error.message}`);
        }
    }

    startPaymentVerification(message, user, pixId) {
        let attempts = 0;
        const maxAttempts = 180; // 30 minutos (10 segundos cada)
        
        const checkInterval = setInterval(async () => {
            attempts++;
            
            try {
                const result = await PixService.checkPaymentStatus(pixId);
                
                if (result.status === 'approved') {
                    clearInterval(checkInterval);
                    const newBalance = await UserService.getBalance(user.id);
                    await message.reply(MessageService.getPaymentConfirmedMessage(
                        result.payment.transaction_amount,
                        newBalance
                    ));
                } else if (result.status === 'rejected' || attempts >= maxAttempts) {
                    clearInterval(checkInterval);
                    if (attempts >= maxAttempts) {
                        await message.reply('⏰ PIX expirado. Gere um novo.');
                    }
                }
            } catch (error) {
                console.error('Erro na verificação:', error);
                if (attempts >= maxAttempts) {
                    clearInterval(checkInterval);
                }
            }
        }, 10000);
    }

    async showAffiliateArea(message, user) {
        const stats = await ReferralService.getReferralStats(user.id);
        
        const affiliateMsg = MessageService.getAffiliateMessage(user, stats);
        await message.reply(affiliateMsg);
        
        const affiliateList = InteractiveListService.getAffiliateMenuList();
        await message.reply(affiliateList);
    }

    async sendReferralText(message, user) {
        const botInfo = this.client.info;
        const botNumber = botInfo.me.user;
        
        const text = MessageService.getReferralTextMessage(
            botNumber,
            user.referral_link,
            user.referral_code
        );
        
        await message.reply(text);
    }

    async withdrawCommission(message, user) {
        const stats = await ReferralService.getReferralStats(user.id);
        
        if (stats.total_commissions <= 0) {
            await message.reply('❌ Você não possui comissões!');
            return;
        }
        
        const result = await ReferralService.withdrawCommission(user.id, stats.total_commissions);
        
        if (result.success) {
            const newBalance = await UserService.getBalance(user.id);
            await message.reply(
                `✅ *COMISSÃO SACADA!*\n\n` +
                `💰 Valor: R$ ${result.amount.toFixed(2)}\n` +
                `💵 Saldo total: R$ ${newBalance.toFixed(2)}`
            );
        }
    }

    async showSupport(message) {
        await message.reply(MessageService.getSupportMessage());
    }

    async processAdminAction(message, user, action) {
        const isAdmin = await AdminService.isAdmin(user.phone_number);
        
        if (!isAdmin) {
            await message.reply('❌ Acesso negado!');
            return;
        }
        
        switch (action) {
            case 'admin_add_product':
                await message.reply('📦 *ADICIONAR PRODUTO*\n\nEnvie os dados no formato:\n\n`Nome | Preço | Estoque | Categoria | Descrição`\n\nExemplo:\n`Netflix | 6.00 | 33 | Streaming | Acesso 30 dias`');
                break;
                
            case 'admin_edit_product':
                const products = await ProductService.getAvailableProducts();
                let productList = '✏️ *EDITAR PRODUTO*\n\nSelecione o ID:\n\n';
                products.forEach(p => {
                    productList += `🆔 ${p.id} - ${p.name}\n`;
                });
                productList += '\n_Digite o ID do produto_';
                await message.reply(productList);
                break;
                
            case 'admin_stock':
                await message.reply('📦 *GERENCIAR ESTOQUE*\n\nEnvie:\n`ID_DO_PRODUTO | QUANTIDADE`\n\nExemplo: `1 | 50`');
                break;
                
            case 'admin_dashboard':
                const stats = await AdminService.getDashboardStats();
                let dashboard = '📊 *DASHBOARD*\n\n';
                dashboard += `👥 Usuários: ${stats.totalUsers}\n`;
                dashboard += `🛍️ Vendas hoje: ${stats.todaySales}\n`;
                dashboard += `💰 Faturamento: R$ ${stats.totalRevenue?.toFixed(2) || '0.00'}\n`;
                dashboard += `💳 Recargas: ${stats.totalRecharges}\n`;
                await message.reply(dashboard);
                break;
                
            case 'admin_broadcast':
                await message.reply('📢 *TRANSMISSÃO*\n\nDigite a mensagem para todos os usuários:\n\n_Digite "cancelar" para sair_');
                global.awaitingBroadcast = global.awaitingBroadcast || new Map();
                global.awaitingBroadcast.set(user.id, true);
                break;
                
            case 'admin_settings':
                const settingsList = InteractiveListService.getSettingsList();
                await message.reply(settingsList);
                break;
                
            default:
                await message.reply('⚠️ Opção não implementada');
        }
    }
}

module.exports = InteractiveHandler;
