#!/bin/bash

clear
echo "🐕 DOGUINHA STORE BOT"
echo "====================="
echo ""

# Matar processos anteriores
echo "🔄 Parando instâncias anteriores..."
pkill -f "node src/index.js" 2>/dev/null
sleep 2

# Verificar Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js não encontrado!"
    exit 1
fi

# Verificar .env
if [ ! -f .env ]; then
    echo "❌ Arquivo .env não encontrado!"
    echo "📝 Execute: cp .env.example .env"
    echo "   Depois edite com suas configurações"
    exit 1
fi

# Verificar auth
if [ "$1" == "--reset" ]; then
    echo "🧹 Limpando sessão anterior..."
    rm -rf auth/*
    echo "✅ Sessão limpa!"
fi

# Iniciar
echo "🚀 Iniciando bot..."
echo ""
echo "📱 Aguarde a solicitação do código..."
echo ""

node src/index.js

# Se der erro
if [ $? -ne 0 ]; then
    echo ""
    echo "❌ Erro ao iniciar!"
    echo ""
    echo "Tente:"
    echo "1. npm install"
    echo "2. Verifique o .env"
    echo "3. ./start.sh --reset"
fi
