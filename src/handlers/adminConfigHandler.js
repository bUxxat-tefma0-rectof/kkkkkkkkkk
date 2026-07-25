const ConfigService = require('../services/configService');

class AdminConfigHandler {
    constructor(sock) {
        this.sock = sock;
    }

    // ============ MENU DE CONFIGURAÇÕES ============
    async showConfigMenu(jid) {
        const sections = [
            {
                title: '📝 MENSAGENS',
                rows: [
                    { title: '📝 Mensagem de Boas-vindas', rowId: 'config_msg_welcome', description: 'Alterar texto inicial' },
                    { title: '💸 Mensagem Menu PIX', rowId: 'config_msg_pix', description: 'Alterar texto do PIX' },
                    { title: '🛍️ Mensagem Catálogo', rowId: 'config_msg_catalog', description: 'Alterar texto do catálogo' },
                    { title: '👤 Mensagem Suporte', rowId: 'config_msg_support', description: 'Alterar texto do suporte' },
                    { title: '❌ Mensagem Saldo Insuficiente', rowId: 'config_msg_insufficient', description: 'Alterar aviso de saldo' },
                    { title: '✅ Mensagem Compra Aprovada', rowId: 'config_msg_success', description: 'Alterar confirmação' }
                ]
            },
            {
                title: '😀 EMOJIS',
                rows: [
                    { title: '💰 Emoji Dinheiro', rowId: 'config_emoji_money', description: 'Atual: ' + await ConfigService.get('emoji_money') },
                    { title: '💳 Emoji PIX', rowId: 'config_emoji_pix', description: 'Atual: ' + await ConfigService.get('emoji_pix') },
                    { title: '✅ Emoji Sucesso', rowId: 'config_emoji_success', description: 'Atual: ' + await ConfigService.get('emoji_success') },
                    { title: '❌ Emoji Erro', rowId: 'config_emoji_error', description: 'Atual: ' + await ConfigService.get('emoji_error') }
                ]
            },
            {
                title: '🔗 LINKS',
                rows: [
                    { title: '📧 Telegram Suporte', rowId: 'config_link_telegram', description: 'Alterar @ do suporte' },
                    { title: '👥 Grupo de Clientes', rowId: 'config_link_group', description: 'Alterar link do grupo' },
                    { title: '🖼️ Logo do Bot', rowId: 'config_link_logo', description: 'Alterar URL da logo' }
                ]
            },
            {
                title: '⚙️ SISTEMA',
                rows: [
                    { title: '📱 Número WhatsApp', rowId: 'config_whatsapp', description: 'Alterar número do bot' },
                    { title: '👑 Número Admin', rowId: 'config_admin', description: 'Alterar administrador' },
                    { title: '💳 API Mercado Pago', rowId: 'config_mp', description: 'Configurar token' },
                    { title: '💰 Percentual Comissão', rowId: 'config_commission', description: 'Alterar % de comissão' },
                    { title: '⏰ Expiração PIX', rowId: 'config_pix_expire', description: 'Alterar tempo do PIX' },
                    { title: '🤖 Nome do Bot', rowId: 'config_botname', description: 'Alterar nome' }
                ]
            },
            {
                title: '🔙 VOLTAR',
                rows: [
                    { title: '🔙 Voltar ao Painel', rowId: 'admin_back', description: 'Retornar' }
                ]
            }
        ];

        await this.sock.sendMessage(jid, {
            title: '⚙️ CONFIGURAÇÕES GERAIS',
            text: '⚙️ *CONFIGURAÇÕES GERAIS*\n\nSelecione o que deseja alterar:',
            footer: 'Escolha uma opção abaixo:',
            buttonText: '⚙️ Configurar',
            sections: sections
        });
    }

    // ============ PROCESSAR COMANDO DE CONFIG ============
    async handleConfigCommand(jid, command, args) {
        try {
            switch (command) {
                // ============ MENSAGENS ============
                case 'config_msg_welcome':
                    await this.sock.sendMessage(jid, { 
                        text: '📝 *ALTERAR MENSAGEM DE BOAS-VINDAS*\n\n' +
                              'Envie a nova mensagem abaixo.\n\n' +
                              'Variáveis disponíveis:\n' +
                              '{number} = Número do usuário\n' +
                              '{balance} = Saldo do usuário\n\n' +
                              '_Envie "cancelar" para sair_' 
                    });
                    global.awaitingConfig = global.awaitingConfig || {};
                    global.awaitingConfig[jid] = 'welcome_message';
                    break;

                case 'config_msg_pix':
                    await this.sock.sendMessage(jid, { 
                        text: '💸 *ALTERAR MENSAGEM DO MENU PIX*\n\nEnvie a nova mensagem:\n\n_Envie "cancelar" para sair_' 
                    });
                    global.awaitingConfig = global.awaitingConfig || {};
                    global.awaitingConfig[jid] = 'pix_menu_message';
                    break;

                case 'config_msg_catalog':
                    await this.sock.sendMessage(jid, { 
                        text: '🛍️ *ALTERAR MENSAGEM DO CATÁLOGO*\n\nEnvie a nova mensagem:\n\n_Envie "cancelar" para sair_' 
                    });
                    global.awaitingConfig = global.awaitingConfig || {};
                    global.awaitingConfig[jid] = 'catalog_message';
                    break;

                case 'config_msg_support':
                    await this.sock.sendMessage(jid, { 
                        text: '👤 *ALTERAR MENSAGEM DE SUPORTE*\n\nEnvie a nova mensagem:\n\n_Envie "cancelar" para sair_' 
                    });
                    global.awaitingConfig = global.awaitingConfig || {};
                    global.awaitingConfig[jid] = 'support_message';
                    break;

                case 'config_msg_insufficient':
                    await this.sock.sendMessage(jid, { 
                        text: '❌ *ALTERAR MENSAGEM DE SALDO INSUFICIENTE*\n\nEnvie a nova mensagem:\n\n{balance} = Saldo\n{price} = Preço\n\n_Envie "cancelar" para sair_' 
                    });
                    global.awaitingConfig = global.awaitingConfig || {};
                    global.awaitingConfig[jid] = 'insufficient_balance_message';
                    break;

                case 'config_msg_success':
                    await this.sock.sendMessage(jid, { 
                        text: '✅ *ALTERAR MENSAGEM DE COMPRA APROVADA*\n\nEnvie a nova mensagem:\n\n_Envie "cancelar" para sair_' 
                    });
                    global.awaitingConfig = global.awaitingConfig || {};
                    global.awaitingConfig[jid] = 'purchase_success_message';
                    break;

                // ============ EMOJIS ============
                case 'config_emoji_money':
                case 'config_emoji_pix':
                case 'config_emoji_success':
                case 'config_emoji_error':
                    const emojiName = command.replace('config_', '');
                    await this.sock.sendMessage(jid, { 
                        text: `😀 *ALTERAR EMOJI*\n\nEnvie o novo emoji para substituir.\n\n_Envie apenas 1 emoji_\n_Envie "cancelar" para sair_` 
                    });
                    global.awaitingConfig = global.awaitingConfig || {};
                    global.awaitingConfig[jid] = emojiName;
                    break;

                // ============ LINKS ============
                case 'config_link_telegram':
                    await this.sock.sendMessage(jid, { 
                        text: '📧 *ALTERAR TELEGRAM DO SUPORTE*\n\nEnvie o novo @ ou link:\n\nExemplo: @meubot\n\n_Envie "cancelar" para sair_' 
                    });
                    global.awaitingConfig = global.awaitingConfig || {};
                    global.awaitingConfig[jid] = 'telegram_support';
                    break;

                case 'config_link_group':
                    await this.sock.sendMessage(jid, { 
                        text: '👥 *ALTERAR GRUPO DE CLIENTES*\n\nEnvie o link do grupo:\n\n_Envie "cancelar" para sair_' 
                    });
                    global.awaitingConfig = global.awaitingConfig || {};
                    global.awaitingConfig[jid] = 'group_client_link';
                    break;

                case 'config_link_logo':
                    await this.sock.sendMessage(jid, { 
                        text: '🖼️ *ALTERAR LOGO DO BOT*\n\nEnvie a URL da imagem:\n\n_Envie "cancelar" para sair_' 
                    });
                    global.awaitingConfig = global.awaitingConfig || {};
                    global.awaitingConfig[jid] = 'logo_url';
                    break;

                // ============ SISTEMA ============
                case 'config_whatsapp':
                    await this.sock.sendMessage(jid, { 
                        text: '📱 *ALTERAR NÚMERO DO WHATSAPP*\n\nEnvie o número com DDD:\n\nExemplo: 5511999999999\n\n_Envie "cancelar" para sair_' 
                    });
                    global.awaitingConfig = global.awaitingConfig || {};
                    global.awaitingConfig[jid] = 'whatsapp_number';
                    break;

                case 'config_admin':
                    await this.sock.sendMessage(jid, { 
                        text: '👑 *ALTERAR NÚMERO DO ADMIN*\n\n⚠️ CUIDADO! Você pode perder o acesso!\n\nEnvie o novo número:\n\n_Envie "cancelar" para sair_' 
                    });
                    global.awaitingConfig = global.awaitingConfig || {};
                    global.awaitingConfig[jid] = 'admin_number';
                    break;

                case 'config_mp':
                    await this.sock.sendMessage(jid, { 
                        text: '💳 *CONFIGURAR MERCADO PAGO*\n\nEnvie o Access Token:\n\nPegue em: https://mercadopago.com.br/developers\n\n_Envie "cancelar" para sair_' 
                    });
                    global.awaitingConfig = global.awaitingConfig || {};
                    global.awaitingConfig[jid] = 'mp_access_token';
                    break;

                case 'config_commission':
                    await this.sock.sendMessage(jid, { 
                        text: '💰 *ALTERAR COMISSÃO*\n\nEnvie o percentual (0-100):\n\nExemplo: 15\n\n_Envie "cancelar" para sair_' 
                    });
                    global.awaitingConfig = global.awaitingConfig || {};
                    global.awaitingConfig[jid] = 'commission_percentage';
                    break;

                case 'config_pix_expire':
                    await this.sock.sendMessage(jid, { 
                        text: '⏰ *ALTERAR EXPIRAÇÃO PIX*\n\nEnvie o tempo em minutos (5-120):\n\nExemplo: 30\n\n_Envie "cancelar" para sair_' 
                    });
                    global.awaitingConfig = global.awaitingConfig || {};
                    global.awaitingConfig[jid] = 'pix_expiration';
                    break;

                case 'config_botname':
                    await this.sock.sendMessage(jid, { 
                        text: '🤖 *ALTERAR NOME DO BOT*\n\nEnvie o novo nome:\n\n_Envie "cancelar" para sair_' 
                    });
                    global.awaitingConfig = global.awaitingConfig || {};
                    global.awaitingConfig[jid] = 'bot_name';
                    break;

                default:
                    await this.sock.sendMessage(jid, { text: '❌ Opção não reconhecida.' });
            }
        } catch (error) {
            await this.sock.sendMessage(jid, { text: `❌ Erro: ${error.message}` });
        }
    }

    // ============ SALVAR CONFIGURAÇÃO ============
    async saveConfig(jid, key, value) {
        try {
            if (value.toLowerCase() === 'cancelar') {
                delete global.awaitingConfig[jid];
                await this.sock.sendMessage(jid, { text: '❌ Operação cancelada.' });
                return;
            }

            // Salvar de acordo com o tipo
            if (key.startsWith('emoji_')) {
                await ConfigService.setEmoji(key, value);
            } else if (['telegram_support', 'group_client_link', 'logo_url'].includes(key)) {
                await ConfigService.setLink(key, value);
            } else if (key === 'whatsapp_number') {
                await ConfigService.setWhatsApp(value);
            } else if (key === 'mp_access_token') {
                await ConfigService.setMercadoPago(value);
            } else if (key === 'commission_percentage') {
                await ConfigService.setCommission(value);
            } else if (key === 'pix_expiration') {
                await ConfigService.setPixExpiration(value);
            } else if (key === 'admin_number') {
                await ConfigService.setAdminNumber(value);
            } else if (key === 'bot_name') {
                await ConfigService.setBotName(value);
            } else {
                await ConfigService.set(key, value);
            }

            delete global.awaitingConfig[jid];
            await this.sock.sendMessage(jid, { 
                text: `✅ *Configuração salva com sucesso!*\n\n🔧 ${key}\n📝 ${value}` 
            });

        } catch (error) {
            await this.sock.sendMessage(jid, { text: `❌ Erro ao salvar: ${error.message}` });
        }
    }
}

module.exports = AdminConfigHandler;
