#!/bin/bash

echo "🐕 DOGUINHA STORE BOT"
echo "====================="
echo ""

# Verificar Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js não encontrado!"
    echo "📥 Instale o Node.js: https://nodejs.org"
    echo "   Ou no Terminal: brew install node"
    exit 1
fi

echo "✅ Node.js $(node -v)"
echo ""

# Criar estrutura de pastas
echo "📁 Criando estrutura de pastas..."
mkdir -p src/config
mkdir -p src/database
mkdir -p src/services
mkdir -p src/handlers
mkdir -p src/utils
mkdir -p auth
mkdir -p logs
mkdir -p backups
mkdir -p database
echo "✅ Pastas criadas!"
echo ""

# Instalar dependências
echo "📦 Instalando dependências..."
npm install
echo "✅ Dependências instaladas!"
echo ""

# Verificar .env
if [ ! -f .env ]; then
    echo "⚠️ Arquivo .env não encontrado!"
    echo "📝 Criando .env de exemplo..."
    cat > .env << 'EOL'
# Bot Config
BOT_NAME=Doguinha Store
ADMIN_NUMBER=5511999999999
SUPPORT_TELEGRAM=@doguinhastore

# Mercado Pago
MP_ACCESS_TOKEN=SEU_TOKEN_AQUI
MP_PUBLIC_KEY=SUA_CHAVE_PUBLICA

# Database
DB_PATH=./database/store.db

# Commission
COMMISSION_PERCENTAGE=10

# PIX Expiration (minutes)
PIX_EXPIRATION=30
EOL
    echo "⚠️ Edite o arquivo .env com suas configurações!"
fi

echo ""
echo "✅ INSTALAÇÃO CONCLUÍDA!"
echo ""
echo "🚀 Para iniciar o bot:"
echo "   npm start"
echo ""
echo "📱 O QR Code aparecerá no terminal"
echo "   Escaneie com seu WhatsApp!"
echo ""
