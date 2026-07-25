#!/bin/bash

echo "🐕 DOGUINHA STORE BOT"
echo "====================="
echo ""

# Matar processos anteriores
echo "🔄 Parando instâncias anteriores..."
pkill -f "node src/index.js" 2>/dev/null
sleep 2

# Limpar cache (opcional)
if [ "$1" == "--clean" ]; then
    echo "🧹 Limpando cache..."
    rm -rf auth/*
    rm -rf .wwebjs_auth/*
    echo "✅ Cache limpo!"
fi

# Iniciar bot
echo "🚀 Iniciando bot..."
echo ""

node src/index.js

# Em caso de erro
if [ $? -ne 0 ]; then
    echo ""
    echo "❌ Erro ao iniciar o bot!"
    echo "Verifique:"
    echo "1. Se o Node.js está instalado"
    echo "2. Se as dependências estão instaladas (npm install)"
    echo "3. Se o arquivo .env está configurado"
fi
