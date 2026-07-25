const { db } = require('../database/init');

class ConfigService {
    // ============ CONFIGURAÇÕES PADRÃO ============
    static defaults = {
        // Mensagens
        welcome_message: '🐕 *DOGUINHA STORE*\n\nBem-vindo(a) à melhor loja de assinaturas!',
        pix_menu_message: '💸 *MENU DE OPÇÕES DE PIX*\n\nEscolha o valor da recarga:',
        catalog_message: '🛍️ *ASSINATURAS PREMIUM*\n\nEscolha um produto:',
        support_message: '👤 *CONTATO DO SUPORTE*\n\nAtendimento via Telegram',
        insufficient_balance_message: '❌ *SALDO INSUFICIENTE*\n\nFaça uma recarga primeiro!',
        purchase_success_message: '✅ *COMPRA REALIZADA!*\n\nAproveite seu produto!',
        
        // Emojis
        emoji_money: '💰',
        emoji_pix: '💳',
        emoji_products: '📦',
        emoji_success: '✅',
        emoji_error: '❌',
        emoji_warning: '⚠️',
        emoji_star: '⭐',
        emoji_fire: '🔥',
        emoji_rocket: '🚀',
        emoji_heart: '❤️',
        emoji_crown: '👑',
        
        // Links
        telegram_support: '@doguinhastore',
        whatsapp_number: '5511999999999',
        group_client_link: 'https://chat.whatsapp.com/SEU_GRUPO',
        logo_url: 'https://i.imgur.com/SUA_LOGO.png',
        
        // API
        mp_access_token: '',
        mp_public_key: '',
        
        // Comissão
        commission_percentage: '10',
        
        // PIX
        pix_expiration: '30',
        pix_min_value: '5',
        
        // Bot
        bot_name: 'Doguinha Store',
        admin_number: '',
    };

    // ============ BUSCAR CONFIGURAÇÃO ============
    static async get(key) {
        return new Promise((resolve, reject) => {
            db.get('SELECT value FROM settings WHERE key = ?', [key], (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row ? row.value : this.defaults[key] || null);
                }
            });
        });
    }

    // ============ SALVAR CONFIGURAÇÃO ============
    static async set(key, value) {
        return new Promise((resolve, reject) => {
            db.run(
                'INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)',
                [key, String(value)],
                (err) => {
                    if (err) reject(err);
                    else resolve(true);
                }
            );
        });
    }

    // ============ BUSCAR TODAS CONFIGURAÇÕES ============
    static async getAll() {
        return new Promise((resolve, reject) => {
            db.all('SELECT * FROM settings ORDER BY key', [], (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    // Mesclar com defaults
                    const config = { ...this.defaults };
                    rows.forEach(row => {
                        config[row.key] = row.value;
                    });
                    resolve(config);
                }
            });
        });
    }

    // ============ ALTERAR MENSAGEM ============
    static async setMessage(type, text) {
        const validTypes = [
            'welcome_message',
            'pix_menu_message', 
            'catalog_message',
            'support_message',
            'insufficient_balance_message',
            'purchase_success_message'
        ];
        
        if (!validTypes.includes(type)) {
            throw new Error(`Tipo de mensagem inválido. Válidos: ${validTypes.join(', ')}`);
        }
        
        return await this.set(type, text);
    }

    // ============ ALTERAR EMOJI ============
    static async setEmoji(name, emoji) {
        const validEmojis = [
            'emoji_money', 'emoji_pix', 'emoji_products',
            'emoji_success', 'emoji_error', 'emoji_warning',
            'emoji_star', 'emoji_fire', 'emoji_rocket',
            'emoji_heart', 'emoji_crown'
        ];
        
        if (!validEmojis.includes(name)) {
            throw new Error(`Nome de emoji inválido. Válidos: ${validEmojis.join(', ')}`);
        }
        
        if (emoji.length > 4) {
            throw new Error('Use apenas 1 emoji por vez');
        }
        
        return await this.set(name, emoji);
    }

    // ============ ALTERAR LINK ============
    static async setLink(type, link) {
        const validLinks = ['telegram_support', 'group_client_link', 'logo_url'];
        
        if (!validLinks.includes(type)) {
            throw new Error(`Tipo de link inválido. Válidos: ${validLinks.join(', ')}`);
        }
        
        return await this.set(type, link);
    }

    // ============ ALTERAR WHATSAPP ============
    static async setWhatsApp(number) {
        const cleanNumber = number.replace(/\D/g, '');
        if (cleanNumber.length < 10 || cleanNumber.length > 13) {
            throw new Error('Número de WhatsApp inválido');
        }
        return await this.set('whatsapp_number', cleanNumber);
    }

    // ============ ALTERAR TELEGRAM SUPORTE ============
    static async setTelegramSupport(telegram) {
        const cleanTelegram = telegram.startsWith('@') ? telegram : `@${telegram}`;
        return await this.set('telegram_support', cleanTelegram);
    }

    // ============ CONFIGURAR MERCADO PAGO ============
    static async setMercadoPago(accessToken, publicKey = '') {
        if (!accessToken || accessToken.length < 10) {
            throw new Error('Token de acesso inválido');
        }
        
        await this.set('mp_access_token', accessToken);
        if (publicKey) {
            await this.set('mp_public_key', publicKey);
        }
        
        // Atualizar variável de ambiente
        process.env.MP_ACCESS_TOKEN = accessToken;
        if (publicKey) process.env.MP_PUBLIC_KEY = publicKey;
        
        return true;
    }

    // ============ ALTERAR COMISSÃO ============
    static async setCommission(percentage) {
        const num = parseFloat(percentage);
        if (isNaN(num) || num < 0 || num > 100) {
            throw new Error('Comissão deve ser entre 0 e 100%');
        }
        return await this.set('commission_percentage', String(num));
    }

    // ============ ALTERAR TEMPO PIX ============
    static async setPixExpiration(minutes) {
        const num = parseInt(minutes);
        if (isNaN(num) || num < 5 || num > 120) {
            throw new Error('Tempo de expiração deve ser entre 5 e 120 minutos');
        }
        return await this.set('pix_expiration', String(num));
    }

    // ============ ALTERAR NOME DO BOT ============
    static async setBotName(name) {
        if (!name || name.length < 3) {
            throw new Error('Nome do bot deve ter pelo menos 3 caracteres');
        }
        return await this.set('bot_name', name);
    }

    // ============ ALTERAR ADMIN ============
    static async setAdminNumber(number) {
        const cleanNumber = number.replace(/\D/g, '');
        if (cleanNumber.length < 10) {
            throw new Error('Número de administrador inválido');
        }
        return await this.set('admin_number', cleanNumber);
    }

    // ============ OBTER MENSAGEM FORMATADA ============
    static async getFormattedMessage(type, replacements = {}) {
        let message = await this.get(type);
        
        // Substituir variáveis
        Object.keys(replacements).forEach(key => {
            message = message.replace(`{${key}}`, replacements[key]);
        });
        
        return message;
    }
}

module.exports = ConfigService;
