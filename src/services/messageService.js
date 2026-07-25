const config = require('../config/settings');

class MessageService {
    // Mensagem de boas-vindas
    static welcome(user) {
        return `🐕 *DOGUINHA STORE*\n\n` +
               `Bem-vindo(a) à melhor loja de assinaturas!\n\n` +
               `📱 *Seu número:* ${user.phone_number}\n` +
               `💰 *Saldo:* R$ ${(user.balance || 0).toFixed(2)}\n` +
               `📧 *Suporte:* ${config.support.telegram}\n\n` +
               `Escolha uma opção abaixo:`;
    }

    // Menu PIX
    static pixMenu() {
        return `💸 *MENU DE OPÇÕES DE PIX*\n\nEscolha o valor da recarga:`;
    }

    // PIX gerado
    static pixGenerated(pixData, amount) {
        const expireDate = new Date(Date.now() + config.pix.expirationMinutes * 60000);
        return `💳 *PAGAMENTO PIX*\n\n` +
               `💰 *Valor:* R$ ${amount.toFixed(2)}\n` +
               `🆔 *ID:* ${pixData.pixId}\n` +
               `⏰ *Vencimento:* ${expireDate.toLocaleString('pt-BR')}\n\n` +
               `📋 *CÓDIGO COPIA E COLA:*\n` +
               `\`\`\`${pixData.copyPaste}\`\`\`\n\n` +
               `⚠️ Expira em ${config.pix.expirationMinutes} minutos\n` +
               `✅ Confirmação automática!`;
    }

    // Pagamento aprovado
    static paymentApproved(amount, newBalance) {
        return `✅ *PAGAMENTO APROVADO!*\n\n` +
               `💸 Recarga: R$ ${amount.toFixed(2)}\n` +
               `💰 Novo saldo: R$ ${newBalance.toFixed(2)}\n\n` +
               `🛍️ Use *menu* para comprar!`;
    }

    // Catálogo
    static catalog(user) {
        return `🛍️ *ASSINATURAS PREMIUM*\n\n` +
               `👤 *Cliente:* ${user.phone_number}\n` +
               `💰 *Saldo:* R$ ${(user.balance || 0).toFixed(2)}\n` +
               `👥 *Grupo:* Clientes VIP\n\n` +
               `📦 *Produtos disponíveis:*`;
    }

    // Saldo insuficiente
    static insufficientBalance(balance, price) {
        return `❌ *SALDO INSUFICIENTE*\n\n` +
               `💰 Seu saldo: R$ ${balance.toFixed(2)}\n` +
               `💵 Preço: R$ ${price.toFixed(2)}\n` +
               `📉 Falta: R$ ${(price - balance).toFixed(2)}\n\n` +
               `💸 Faça uma recarga primeiro!`;
    }

    // Confirmar compra
    static confirmPurchase(product) {
        return `🛒 *CONFIRMAR COMPRA*\n\n` +
               `📦 Produto: ${product.name}\n` +
               `💰 Valor: R$ ${product.price.toFixed(2)}\n` +
               `📦 Estoque: ${product.stock} unid.\n\n` +
               `Digite *confirmar* para comprar\n` +
               `Digite *cancelar* para desistir`;
    }

    // Compra realizada
    static purchaseSuccess(product, credentials) {
        return `✅ *COMPRA REALIZADA!*\n\n` +
               `📦 ${product.name}\n` +
               `💰 R$ ${product.price.toFixed(2)}\n\n` +
               `🔐 *DADOS DE ACESSO:*\n` +
               `📧 Login: \`${credentials.login}\`\n` +
               `🔑 Senha: \`${credentials.password}\`\n` +
               `🔗 Link: ${credentials.accessLink}\n` +
               `📅 Vence: ${credentials.expirationDate.toLocaleDateString('pt-BR')}\n\n` +
               `⚠️ *Guarde esses dados!*`;
    }

    // Área do associado
    static affiliate(user, stats) {
        return `💼 *ÁREA DO ASSOCIADO*\n\n` +
               `🔗 *Link:* ${user.referral_link || 'Gerando...'}\n` +
               `📝 *Código:* \`${user.referral_code}\`\n\n` +
               `💰 *Comissão:* R$ ${(user.commission_balance || 0).toFixed(2)}\n` +
               `👥 *Indicados:* ${stats.total_referrals || 0}\n` +
               `📊 *Percentual:* ${config.commission.percentage}%`;
    }

    // Texto modelo divulgação
    static referralText(botNumber, user) {
        return `🐕 *DOGUINHA STORE*\n\n` +
               `🎉 Assinaturas Premium com os melhores preços!\n\n` +
               `📱 *Chame o bot:* +${botNumber}\n` +
               `🔗 *Link:* ${user.referral_link}\n` +
               `📝 *Código:* \`${user.referral_code}\`\n\n` +
               `✨ Use meu código e ganhe benefícios!`;
    }

    // Suporte
    static support() {
        return `👤 *CONTATO DO SUPORTE*\n\n` +
               `📱 *Telegram:* ${config.support.telegram}\n` +
               `🔗 *Link:* https://t.me/${config.support.telegram.replace('@', '')}\n\n` +
               `⏰ *Horário:*\n` +
               `📅 Seg a Sex: 09h às 18h\n` +
               `📅 Sáb: 09h às 13h\n` +
               `📅 Dom: Fechado\n\n` +
               `ℹ️ Atendimento apenas via Telegram`;
    }

    // Painel Admin
    static adminPanel(stats) {
        return `👑 *PAINEL ADMINISTRATIVO*\n\n` +
               `📊 *ESTATÍSTICAS:*\n` +
               `👥 Usuários: ${stats.totalUsers || 0}\n` +
               `🛍️ Vendas hoje: ${stats.todaySales || 0}\n` +
               `💰 Faturamento: R$ ${(stats.totalRevenue || 0).toFixed(2)}\n` +
               `💳 Recargas: ${stats.totalRecharges || 0}\n\n` +
               `📦 *COMANDOS DISPONÍVEIS:*\n\n` +
               `*PRODUTOS:*\n` +
               `➕ \`/addproduto Nome|Preço|Estoque|Categoria\`\n` +
               `❌ \`/removerproduto ID\`\n` +
               `✏️ \`/editarproduto ID|Nome|Preço|Estoque\`\n` +
               `📦 \`/estoque ID|Quantidade\`\n` +
               `📋 \`/listarprodutos\`\n\n` +
               `*USUÁRIOS:*\n` +
               `👥 \`/usuarios\`\n` +
               `🔍 \`/usuario NUMERO\`\n\n` +
               `*VENDAS:*\n` +
               `🛍️ \`/vendas\`\n` +
               `💳 \`/recargas\`\n` +
               `🏆 \`/topvendas\`\n\n` +
               `*CONFIGURAÇÕES:*\n` +
               `⚙️ \`/config NOME VALOR\`\n` +
               `📋 \`/verconfig\`\n\n` +
               `*TRANSMISSÃO:*\n` +
               `📢 \`/broadcast MENSAGEM\``;
    }

    // Comissão sacada
    static commissionWithdrawn(amount, newBalance) {
        return `✅ *COMISSÃO SACADA!*\n\n` +
               `💰 Valor: R$ ${amount.toFixed(2)}\n` +
               `💵 Saldo total: R$ ${newBalance.toFixed(2)}`;
    }

    // Erro genérico
    static error(msg) {
        return `❌ ${msg}`;
    }

    // Sucesso genérico
    static success(msg) {
        return `✅ ${msg}`;
    }
}

module.exports = MessageService;
