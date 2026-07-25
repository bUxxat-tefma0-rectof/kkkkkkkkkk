#!/bin/bash

clear
echo "🐕 DOGUINHA STORE BOT"
echo "====================="
echo ""

# Verificar Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js não encontrado!"
    echo ""
    echo "📥 Instale o Node.js 18+:"
    echo "   https://nodejs.org"
    echo ""
    echo "Ou no terminal:"
    echo "   curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash"
    echo "   nvm install 18"
    exit 1
fi

echo "✅ Node.js $(node -v)"
echo ""

# Criar pastas
echo "📁 Criando estrutura..."
mkdir -p src/config src/database src/services src/handlers src/utils
mkdir -p auth logs backups database
echo "✅ Pastas criadas!"
echo ""

# Instalar dependências
echo "📦 Instalando dependências..."
npm install @whiskeysockets/baileys@latest
npm install pino qrcode-terminal axios better-sqlite3 pdfkit dotenv
echo "✅ Dependências instaladas!"
echo ""

# Criar .env se não existir
if [ ! -f .env ]; then
    echo "📝 Criando arquivo .env..."
    cp .env.example .env 2>/dev/null || cat > .env << 'EOL'
BOT_NAME=Doguinha Store
ADMIN_NUMBER=5511999999999
SUPPORT_TELEGRAM=@doguinhastore
MP_ACCESS_TOKEN=SEU_TOKEN_AQUI
MP_PUBLIC_KEY=SUA_CHAVE_AQUI
COMMISSION_PERCENTAGE=10
PIX_EXPIRATION=30
DB_PATH=./database/store.db
EOL
    echo "⚠️ Edite o arquivo .env com suas configurações!"
    echo ""
fi

echo "✅ INSTALAÇÃO CONCLUÍDA!"
echo ""
echo "🚀 PARA INICIAR:"
echo "   npm start"
echo ""
echo "📱 O bot pedirá o código de pareamento"
echo "   Digite o código de 8 dígitos do WhatsApp"
echo ""
