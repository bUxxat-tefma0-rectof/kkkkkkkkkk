const MenuHandler = require('../services/menuHandler');
const UserService = require('../services/userService');
const AdminService = require('../services/adminService');
const ProductService = require('../services/productService');

class MessageHandler {
    constructor(client) {
        this.client = client;
        this.menuHandler = new MenuHandler(client);
    }

    async processMessage(message) {
        try {
            // Ignorar mensagens de grupos e status
            if (message.from.includes('@g.us') || message.from === 'status@broadcast') {
                return;
            }

            const phoneNumber = message.from.replace('@c.us', '');
            const user = await UserService.getOrCreateUser(phoneNumber);
            const text = message.body.trim();
            const userState = this.menuHandler.getUserState(user.id);

            // Verificar se é admin e está no modo de transmissão
            if (userState?.state === 'awaiting_broadcast') {
                if (text.toLowerCase() === 'cancelar') {
                    await message.reply('❌ Transmissão cancelada.');
                    this.menuHandler.clearUserState(user.id);
                } else {
                    await this.menuHandler.executeBroadcast(message, user);
                }
                return;
            }

            // Verificar se está aguardando valor PIX personalizado
            if (userState?.state === 'pix_menu' && !isNaN(text) && parseFloat(text) > 0) {
                await this.menuHandler.handlePixValue(message, user, parseFloat(text));
                return;
            }

            // Processar comandos principais
            const command = text.toLowerCase();

            switch (command) {
                case 'oi':
                case 'olá':
                case 'ola':
                case 'menu':
                case 'inicio':
                case 'início':
                case 'start':
                    await this.menuHandler.handleMainMenu(message, user);
                    break;

                case '1':
                case 'adicionar saldo':
                case 'pix':
                case 'recarga':
                case 'saldo':
                    await this.menuHandler.handlePixMenu(message, user);
                    break;

                case '2':
                case 'assinaturas':
                case 'catalogo':
                case 'catálogo':
                case 'produtos':
                    await this.menuHandler.handleCatalog(message, user);
                    break;

                case '3':
                case 'área do associado':
                case 'area do associado':
                case 'associado':
                case 'afiliado':
                    await this.menuHandler.handleAffiliateArea(message, user);
                    break;

                case '4':
                case 'suporte':
                case 'contato':
                case 'ajuda':
                    await this.menuHandler.handleSupport(message, user);
                    break;

                // Comandos da área do associado
                case 'texto modelo':
                case 'modelo':
                case 'divulgação':
                case 'divulgacao':
                    if (userState?.state === 'affiliate_area') {
                        await this.menuHandler.handleReferralText(message, user);
                    }
                    break;

                case 'sacar':
                case 'saque':
                case 'resgate':
                    if (userState?.state === 'affiliate_area') {
                        await this.menuHandler.handleWithdrawCommission(message, user);
                    }
                    break;

                // Comandos admin
                case 'admin':
                case 'painel':
                case 'adm':
                    await this.menuHandler.handleAdminPanel(message, user);
                    break;

                case 'dashboard':
                case 'relatorio':
                case 'relatório':
                case 'stats':
                    await this.menuHandler.handleAdminDashboard(message, user);
                    break;

                case 'broadcast':
                case 'transmissão':
                case 'transmissao':
                case 'enviar todos':
                    await this.menuHandler.handleBroadcast(message, user);
                    break;

                case 'gerenciar produtos':
                case 'produtos admin':
                    await this.menuHandler.handleAdminProductManagement(message, user);
                    break;

                // Comandos de compra
                case 'confirmar':
                case 'sim':
                case 'ok':
                case '✅':
                    if (userState?.state === 'product_detail') {
                        await this.menuHandler.handlePurchaseConfirmation(message, user);
                    }
                    break;

                case 'cancelar':
                case 'não':
                case 'nao':
                case '❌':
                    if (userState?.state === 'product_detail') {
                        await message.reply('❌ Compra cancelada.');
                        this.menuHandler.clearUserState(user.id);
                        await this.menuHandler.handleMainMenu(message, user);
                    }
                    break;

                // PIX valores fixos
                case 'pix 5':
                case '5 reais':
                    await this.menuHandler.handlePixValue(message, user, 5);
                    break;

                case 'pix 8':
                case '8 reais':
                    await this.menuHandler.handlePixValue(message, user, 8);
                    break;

                case 'pix 20':
                case '20 reais':
                    await this.menuHandler.handlePixValue(message, user, 20);
                    break;

                // Ver mais produtos
                case 'mais':
                case 'proximo':
                case 'próximo':
                case 'next':
                    if (userState?.state === 'catalog') {
                        const nextPage = (userState.page || 1) + 1;
                        userState.page = nextPage;
                        const products = await ProductService.getAvailableProducts();
                        const start = (nextPage - 1) * 10;
                        const pageProducts = products.slice(start, start + 10);
                        
                        if (pageProducts.length > 0) {
                            let message = `📄 *Página ${nextPage}*\n\n`;
                            pageProducts.forEach((product, index) => {
                                message += `${start + index + 1}️⃣ *${product.name}*\n`;
                                message += `   💰 R$ ${product.price.toFixed(2)}\n`;
                                message += `   📦 Estoque: ${product.stock}\n\n`;
                            });
                            await message.reply(message);
                        } else {
                            await message.reply('📄 Não há mais produtos.');
                        }
                    }
                    break;

                // Seleção de produto por número
                default:
                    if (userState?.state === 'catalog' && !isNaN(text)) {
                        const productIndex = parseInt(text);
                        await this.menuHandler.handleProductSelection(message, user, productIndex);
                    } else if (!isNaN(text) && parseFloat(text) > 0) {
                        // Valor numérico para PIX
                        await this.menuHandler.handlePixValue(message, user, parseFloat(text));
                    } else {
                        // Mensagem não reconhecida
                        await this.menuHandler.handleMainMenu(message, user);
                    }
                    break;
            }

            // Registrar log
            await AdminService.addLog('message', user.id, `Comando: ${command}`);

        } catch (error) {
            console.error('Erro ao processar mensagem:', error);
            await message.reply('❌ Ocorreu um erro. Tente novamente ou digite *menu* para reiniciar.');
        }
    }
}

module.exports = MessageHandler;
