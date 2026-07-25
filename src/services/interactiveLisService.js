const { Buttons, List } = require('whatsapp-web.js');

class InteractiveListService {
    /**
     * Criar botões interativos (máx 3 botões por mensagem)
     */
    static createButtons(buttons) {
        const buttonList = new Buttons(
            buttons[0]?.body || 'Menu',
            buttons.slice(0, 3).map(btn => ({
                body: btn.body,
                id: btn.id
            })),
            buttons[0]?.title || 'Opções',
            buttons[0]?.footer || 'Escolha uma opção'
        );
        return buttonList;
    }

    /**
     * Criar lista interativa (máx 10 itens por seção)
     */
    static createList(title, sections, buttonText = 'Ver Opções') {
        const list = new List(
            title || 'Menu',
            buttonText,
            sections.map(section => ({
                title: section.title,
                rows: section.rows.map(row => ({
                    id: row.id,
                    title: row.title,
                    description: row.description || ''
                }))
            })),
            'Escolha uma opção abaixo:'
        );
        return list;
    }

    /**
     * MENU PRINCIPAL - Lista Interativa
     */
    static getMainMenuList(userPhone, balance) {
        return this.createList(
            `🐕 DOGUINHA STORE`,
            [{
                title: '📋 MENU PRINCIPAL',
                rows: [
                    {
                        id: 'menu_add_balance',
                        title: '💸 Adicionar Saldo',
                        description: 'Recarregue seu saldo via PIX'
                    },
                    {
                        id: 'menu_products',
                        title: '🛍️ Assinaturas Premium',
                        description: 'Veja nosso catálogo'
                    },
                    {
                        id: 'menu_affiliate',
                        title: '💼 Área do Associado',
                        description: 'Indique e ganhe comissões'
                    },
                    {
                        id: 'menu_support',
                        title: '👤 Contato do Suporte',
                        description: 'Fale com nosso time'
                    }
                ]
            }],
            '📱 Menu Principal'
        );
    }

    /**
     * MENU PIX - Lista Interativa
     */
    static getPixMenuList() {
        return this.createList(
            '💸 MENU DE OPÇÕES DE PIX',
            [{
                title: '💰 VALORES DISPONÍVEIS',
                rows: [
                    {
                        id: 'pix_5',
                        title: '💵 PIX R$ 5,00',
                        description: 'Recarga de 5 reais'
                    },
                    {
                        id: 'pix_8',
                        title: '💵 PIX R$ 8,00',
                        description: 'Recarga de 8 reais'
                    },
                    {
                        id: 'pix_20',
                        title: '💵 PIX R$ 20,00',
                        description: 'Recarga de 20 reais'
                    },
                    {
                        id: 'pix_custom',
                        title: '✍️ Digite outro valor',
                        description: 'Escolha um valor personalizado'
                    }
                ]
            }, {
                title: '🔙 VOLTAR',
                rows: [
                    {
                        id: 'menu_back',
                        title: '🔙 Menu Inicial',
                        description: 'Voltar ao menu principal'
                    }
                ]
            }],
            '💳 Opções PIX'
        );
    }

    /**
     * CATÁLOGO DE PRODUTOS - Lista Interativa
     */
    static getProductCatalogList(products, page = 1) {
        const productsPerPage = 10;
        const start = (page - 1) * productsPerPage;
        const end = start + productsPerPage;
        const pageProducts = products.slice(start, end);

        const sections = [{
            title: `📦 PRODUTOS (Página ${page})`,
            rows: pageProducts.map(product => ({
                id: `product_${product.id}`,
                title: product.name,
                description: `💰 R$ ${product.price.toFixed(2)} | 📦 Estoque: ${product.stock}`
            }))
        }];

        // Adicionar opção "Mostrar Mais" se houver mais produtos
        if (products.length > end) {
            sections.push({
                title: '📄 MAIS OPÇÕES',
                rows: [{
                    id: `catalog_page_${page + 1}`,
                    title: '📄 Mostrar Mais',
                    description: `Ver página ${page + 1}`
                }]
            });
        }

        // Adicionar botão voltar
        sections.push({
            title: '🔙 VOLTAR',
            rows: [{
                id: 'menu_back',
                title: '🔙 Menu Inicial',
                description: 'Voltar ao menu principal'
            }]
        });

        return this.createList(
            `🛍️ ASSINATURAS PREMIUM`,
            sections,
            '📦 Ver Produtos'
        );
    }

    /**
     * CONFIRMAÇÃO DE COMPRA - Botões
     */
    static getPurchaseConfirmationButtons(productName, price) {
        return this.createButtons([
            {
                id: 'confirm_purchase',
                body: '✅ Confirmar'
            },
            {
                id: 'cancel_purchase',
                body: '❌ Cancelar'
            }
        ]);
    }

    /**
     * ÁREA DO ASSOCIADO - Lista Interativa
     */
    static getAffiliateMenuList() {
        return this.createList(
            '💼 ÁREA DO ASSOCIADO',
            [{
                title: '📢 OPÇÕES',
                rows: [
                    {
                        id: 'affiliate_text',
                        title: '📢 Texto Modelo',
                        description: 'Mensagem pronta para divulgação'
                    },
                    {
                        id: 'affiliate_withdraw',
                        title: '💰 Sacar Comissão',
                        description: 'Transferir para o saldo'
                    }
                ]
            }, {
                title: '🔙 VOLTAR',
                rows: [{
                    id: 'menu_back',
                    title: '🔙 Menu Inicial',
                    description: 'Voltar ao menu principal'
                }]
            }],
            '💼 Menu Associado'
        );
    }

    /**
     * PAINEL ADMIN - Lista Interativa
     */
    static getAdminPanelList() {
        return this.createList(
            '👑 PAINEL ADMINISTRATIVO',
            [{
                title: '📦 PRODUTOS',
                rows: [
                    {
                        id: 'admin_add_product',
                        title: '➕ Adicionar Produto',
                        description: 'Cadastrar novo produto'
                    },
                    {
                        id: 'admin_edit_product',
                        title: '✏️ Editar Produto',
                        description: 'Alterar produto existente'
                    },
                    {
                        id: 'admin_remove_product',
                        title: '❌ Remover Produto',
                        description: 'Desativar produto'
                    },
                    {
                        id: 'admin_stock',
                        title: '📦 Gerenciar Estoque',
                        description: 'Adicionar/remover estoque'
                    }
                ]
            }, {
                title: '📊 RELATÓRIOS',
                rows: [
                    {
                        id: 'admin_dashboard',
                        title: '📊 Dashboard',
                        description: 'Visão geral do bot'
                    },
                    {
                        id: 'admin_users',
                        title: '👥 Usuários',
                        description: 'Lista de usuários'
                    },
                    {
                        id: 'admin_sales',
                        title: '💰 Vendas',
                        description: 'Histórico de compras'
                    }
                ]
            }, {
                title: '⚙️ CONFIGURAÇÕES',
                rows: [
                    {
                        id: 'admin_settings',
                        title: '⚙️ Configurações Gerais',
                        description: 'Alterar configurações'
                    },
                    {
                        id: 'admin_broadcast',
                        title: '📢 Transmissão',
                        description: 'Enviar mensagem para todos'
                    }
                ]
            }],
            '👑 Painel Admin'
        );
    }

    /**
     * CONFIGURAÇÕES - Lista Interativa
     */
    static getSettingsList() {
        return this.createList(
            '⚙️ CONFIGURAÇÕES GERAIS',
            [{
                title: '🔧 ALTERAR',
                rows: [
                    {
                        id: 'config_admin_number',
                        title: '📱 Número Admin',
                        description: 'Alterar número do administrador'
                    },
                    {
                        id: 'config_telegram',
                        title: '📧 Telegram Suporte',
                        description: 'Alterar Telegram do suporte'
                    },
                    {
                        id: 'config_commission',
                        title: '💰 Comissão',
                        description: 'Alterar % de comissão'
                    },
                    {
                        id: 'config_pix_expiration',
                        title: '⏰ Expiração PIX',
                        description: 'Alterar tempo de expiração'
                    },
                    {
                        id: 'config_mp_token',
                        title: '🔑 Token Mercado Pago',
                        description: 'Configurar API'
                    }
                ]
            }, {
                title: '📝 MENSAGENS',
                rows: [
                    {
                        id: 'config_welcome',
                        title: '📝 Mensagem Boas-vindas',
                        description: 'Alterar texto inicial'
                    },
                    {
                        id: 'config_catalog',
                        title: '🛍️ Mensagem Catálogo',
                        description: 'Alterar texto do catálogo'
                    }
                ]
            }],
            '⚙️ Configurações'
        );
    }
}

module.exports = InteractiveListService;
