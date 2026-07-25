module.exports = {
    bot: {
        name: process.env.BOT_NAME || '🐕 DOGUINHA STORE BOT',
        version: '1.0.0',
        adminNumber: process.env.ADMIN_NUMBER
    },
    
    pix: {
        expirationMinutes: parseInt(process.env.PIX_EXPIRATION) || 30,
        minValue: 5,
        fixedValues: [5, 8, 20]
    },
    
    commission: {
        percentage: parseInt(process.env.COMMISSION_PERCENTAGE) || 10
    },
    
    support: {
        telegram: process.env.SUPPORT_TELEGRAM,
        message: '📞 Atendimento apenas via Telegram'
    },
    
    messages: {
        welcome: '🐕 *DOGUINHA STORE* \n\n' +
                'Bem-vindo(a) à melhor loja de assinaturas!\n\n' +
                '📱 Seu número: {number}\n' +
                '💰 Saldo: R$ {balance}\n\n' +
                'Escolha uma opção:',
        
        pixMenu: '💸 *MENU DE OPÇÕES DE PIX*\n\n' +
                 'Escolha o valor da recarga:',
        
        generatingPix: '⏳ Gerando PIX...',
        
        insufficientBalance: '❌ *Saldo Insuficiente*\n\n' +
                            'Seu saldo: R$ {balance}\n' +
                            'Valor necessário: R$ {price}\n\n' +
                            'Faça uma recarga primeiro!'
    }
};
