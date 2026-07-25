const config = require('../config/settings');

class MessageService {
    static getWelcomeMessage(user) {
        return `🐕 *DOGUINHA STORE* \n\n` +
               `Bem-vindo(a) à melhor loja de assinaturas!\n\n` +
               `📱 *Seu número:* ${user.phone_number}\n` +
               `💰 *Saldo:* R$ ${user.balance.toFixed(2)}\n\n` +
               `Escolha uma opção abaixo:`;
    }

    static getPixMenuMessage() {
        return `💸 *MENU DE OPÇÕES DE PIX*\n\n` +
               `Escolha o valor da recarga:\n\n` +
               `1️⃣ PIX R$ 5,00\n` +
               `2️⃣ PIX R$ 8,00\n` +
               `3️⃣ PIX R$ 20,00\n` +
               `4️⃣ Digite outro valor\n` +
               `5️⃣ 🔙 Menu Inicial`;
    }

    static getPixGeneratedMessage(pixData) {
        return `💳 *PAGAMENTO PIX GERADO*\n\n` +
               `💰 *Valor:* R$ ${pixData.amount.toFixed(2)}\n` +
               `🆔 *ID:* ${pixData.pixId}\n` +
               `⏰ *Vencimento:* ${pixData.expirationDate.toLocaleString('pt-BR')}\n\n` +
               `📋 *CÓDIGO PIX COPIA E COLA:*\n` +
               `\`\`\`${pixData.copyPaste}\`\`\`\n\n` +
               `⚠️ _O código expira em ${config.pix.expirationMinutes} minutos_\n` +
               `✅ _Pagamento confirmado automaticamente!_`;
    }

    static getCatalogMessage(user, products) {
        let message = `🛍️ *ASSINATURAS PREMIUM*\n\n` +
                     `👤 *Grupo de Clientes:* VIP\n` +
                     `📱 *Número:* ${user.phone_number}\n` +
                     `💰 *Saldo disponível:* R$ ${user.balance.toFixed(2)}\n\n` +
                     `📦 *PRODUTOS DISPONÍVEIS:*\n\n`;

        if (products.length === 0) {
            message += `❌ Nenhum produto disponível no momento.\n`;
        } else {
            products.slice(0, 10).forEach((product, index) => {
                message += `${index + 1}️⃣ *${product.name}*\n` +
                          `   💰 R$ ${product.price.toFixed(2)}\n` +
                          `   📦 Estoque: ${product.stock}\n\n`;
            });

            if (products.length > 10) {
                message += `📄 _Digite "mais" para ver mais produtos_`;
            }
        }

        return message;
    }

    static getProductDetailMessage(product) {
        return `📦 *${product.name}*\n\n` +
               `💰 *Valor:* R$ ${product.price.toFixed(2)}\n` +
               `📦 *Estoque:* ${product.stock} unidades\n` +
               `📝 *Descrição:* ${product.description || 'Produto premium'}\n\n` +
               `✅ Confirmar compra?\n` +
               `1️⃣ ✅ Confirmar\n` +
               `2️⃣ ❌ Cancelar`;
    }

    static getPurchaseSuccessMessage(product, credentials) {
        return `✅ *COMPRA REALIZADA COM SUCESSO!*\n\n` +
               `📦 *Produto:* ${product.name}\n` +
               `💰 *Valor:* R$ ${product.price.toFixed(2)}\n\n` +
               `🔐 *CREDENCIAIS DE ACESSO:*\n` +
               `📧 *Login:* \`${credentials.login}\`\n` +
               `🔑 *Senha:* \`${credentials.password}\`\n` +
               `🔗 *Link:* ${credentials.accessLink}\n` +
               `📅 *Vencimento:* ${credentials.expirationDate.toLocaleDateString('pt-BR')}\n\n` +
               `⚠️ *Guarde em local seguro!*\n` +
               `📄 _PDF enviado com os dados_`;
    }

    static getInsufficientBalanceMessage(balance, price) {
        return `❌ *SALDO INSUFICIENTE*\n\n` +
               `💰 Seu saldo: R$ ${balance.toFixed(2)}\n` +
               `💵 Valor necessário: R$ ${price.toFixed(2)}\n` +
               `📉 Faltam: R$ ${(price - balance).toFixed(2)}\n\n` +
               `💸 Faça uma recarga primeiro!`;
    }

    static getAffiliateMessage(user, stats) {
        return `💼 *ÁREA DO ASSOCIADO*\n\n` +
               `🔗 *Link de Indicação:*\n${user.referral_link}\n\n` +
               `📝 *Código de Indicação:*\n\`${user.referral_code}\`\n\n` +
               `💰 *Saldo de Comissão:* R$ ${(user.commission_balance || 0).toFixed(2)}\n` +
               `👥 *Total de Indicados:* ${stats.total_referrals || 0}\n` +
               `📊 *Percentual de Comissão:* ${config.commission.percentage}%\n\n` +
               `📢 *Opções:*\n` +
               `1️⃣ 📢 Texto Modelo\n` +
               `2️⃣ 💰 Sacar Comissão\n` +
               `3️⃣ 🔙 Menu Inicial`;
    }

    static getReferralTextMessage(botNumber, referralLink, referralCode) {
        return `🐕 *DOGUINHA STORE - CONVITE ESPECIAL!*\n\n` +
               `🎉 Assinaturas Premium com os melhores preços!\n\n` +
               `📱 *Bot:* +${botNumber}\n` +
               `🔗 *Link:* ${referralLink}\n` +
               `📝 *Código:* \`${referralCode}\`\n\n` +
               `✨ Use meu código e ganhe benefícios!\n\n` +
               `🏷️ *Como usar:*\n` +
               `1. Chame o bot no WhatsApp\n` +
               `2. Envie "Oi" para começar\n` +
               `3. Use o código: ${referralCode}\n\n` +
               `🐾 _Venha para Doguinha Store!_`;
    }

    static getSupportMessage() {
        return `👤 *CONTATO DO SUPORTE*\n\n` +
               `📱 *Telegram:* ${config.support.telegram}\n\n` +
               `ℹ️ *Atendimento exclusivo via Telegram*\n\n` +
               `⏰ *Horário de Atendimento:*\n` +
               `📅 Seg a Sex: 09h às 18h\n` +
               `📅 Sáb: 09h às 13h\n` +
               `📅 Dom: Fechado\n\n` +
               `⚠️ _Não realizamos atendimento por WhatsApp_\n` +
               `⚠️ _Não realizamos atendimento por chamada_`;
    }

    static getAdminPanelMessage() {
        return `👑 *PAINEL ADMINISTRATIVO*\n\n` +
               `📊 *Gestão do Bot*\n\n` +
               `1️⃣ 📦 Gerenciar Produtos\n` +
               `2️⃣ 👥 Gerenciar Usuários\n` +
               `3️⃣ 📊 Relatórios\n` +
               `4️⃣ 📢 Transmissão\n` +
               `5️⃣ ⚙️ Configurações\n` +
               `6️⃣ 💰 Financeiro\n` +
               `7️⃣ 🔙 Sair`;
    }

    static getProductManagementMessage() {
        return `📦 *GERENCIAR PRODUTOS*\n\n` +
               `1️⃣ ➕ Adicionar Produto\n` +
               `2️⃣ ✏️ Editar Produto\n` +
               `3️⃣ ❌ Remover Produto\n` +
               `4️⃣ 📦 Gerenciar Estoque\n` +
               `5️⃣ 📋 Listar Produtos\n` +
               `6️⃣ 🔙 Voltar`;
    }

    static getBroadcastMessage() {
        return `📢 *SISTEMA DE TRANSMISSÃO*\n\n` +
               `Envie a mensagem que deseja transmitir para todos os usuários.\n\n` +
               `✍️ _Digite a mensagem abaixo:_\n\n` +
               `⚠️ *Formatos suportados:*\n` +
               `• Texto\n` +
               `• Emojis\n` +
               `• Negrito: *texto*\n` +
               `• Itálico: _texto_\n` +
               `• Código: \`texto\`\n\n` +
               `Digite "cancelar" para sair`;
    }

    static getPaymentConfirmedMessage(amount, newBalance) {
        return `✅ *PAGAMENTO CONFIRMADO!*\n\n` +
               `💸 *Recarga de:* R$ ${amount.toFixed(2)}\n` +
               `💰 *Novo saldo:* R$ ${newBalance.toFixed(2)}\n\n` +
               `🛍️ Aproveite suas compras!`;
    }

    static formatCurrency(value) {
        return `R$ ${parseFloat(value).toFixed(2)}`;
    }

    static formatDate(date) {
        return new Date(date).toLocaleString('pt-BR');
    }
}

module.exports = MessageService;
