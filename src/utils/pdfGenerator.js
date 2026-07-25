const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

class PDFGenerator {
    static async generatePurchasePDF(purchaseData) {
        return new Promise((resolve, reject) => {
            try {
                const doc = new PDFDocument({
                    size: 'A4',
                    margin: 50
                });
                
                const chunks = [];
                
                doc.on('data', (chunk) => chunks.push(chunk));
                doc.on('end', () => resolve(Buffer.concat(chunks)));
                
                // Cabeçalho
                doc.fontSize(24)
                   .font('Helvetica-Bold')
                   .text('🐕 DOGUINHA STORE', { align: 'center' });
                
                doc.moveDown(0.5);
                
                doc.fontSize(12)
                   .font('Helvetica')
                   .text('Comprovante de Compra', { align: 'center' })
                   .moveDown(1);
                
                // Linha separadora
                doc.moveTo(50, doc.y)
                   .lineTo(545, doc.y)
                   .stroke()
                   .moveDown(1);
                
                // Dados da compra
                doc.fontSize(14)
                   .font('Helvetica-Bold')
                   .text('DADOS DA COMPRA', { underline: true })
                   .moveDown(0.5);
                
                doc.fontSize(12)
                   .font('Helvetica')
                   .text(`📅 Data: ${purchaseData.purchaseDate.toLocaleString('pt-BR')}`)
                   .text(`📦 Produto: ${purchaseData.productName}`)
                   .text(`💰 Valor: R$ ${purchaseData.amount.toFixed(2)}`)
                   .moveDown(1);
                
                // Credenciais
                doc.fontSize(14)
                   .font('Helvetica-Bold')
                   .text('CREDENCIAIS DE ACESSO', { underline: true })
                   .moveDown(0.5);
                
                doc.fontSize(12)
                   .font('Helvetica');
                
                if (purchaseData.credentials) {
                    doc.text(`📧 Login: ${purchaseData.credentials.login}`)
                       .text(`🔑 Senha: ${purchaseData.credentials.password}`)
                       .text(`🔗 Link: ${purchaseData.credentials.accessLink}`);
                    
                    if (purchaseData.credentials.expirationDate) {
                        doc.text(`📅 Vencimento: ${purchaseData.credentials.expirationDate.toLocaleDateString('pt-BR')}`);
                    }
                }
                
                doc.moveDown(2);
                
                // Instruções
                doc.fontSize(11)
                   .font('Helvetica-Oblique')
                   .text('INSTRUÇÕES DE USO:', { underline: true })
                   .moveDown(0.3);
                
                doc.fontSize(10)
                   .font('Helvetica')
                   .text('1. Acesse o link fornecido acima')
                   .text('2. Faça login com as credenciais')
                   .text('3. Aproveite seu acesso premium!')
                   .moveDown(1);
                
                // Rodapé
                doc.moveTo(50, doc.y)
                   .lineTo(545, doc.y)
                   .stroke()
                   .moveDown(0.5);
                
                doc.fontSize(10)
                   .font('Helvetica')
                   .text('Doguinha Store - A melhor loja de assinaturas!', { align: 'center' })
                   .text('Suporte via Telegram: @doguinhastore', { align: 'center' })
                   .text('Obrigado pela preferência! 🐾', { align: 'center' });
                
                // Finalizar
                doc.end();
                
            } catch (error) {
                reject(error);
            }
        });
    }
    
    static async generateReportPDF(reportData) {
        return new Promise((resolve, reject) => {
            try {
                const doc = new PDFDocument({
                    size: 'A4',
                    margin: 50,
                    layout: 'landscape'
                });
                
                const chunks = [];
                
                doc.on('data', (chunk) => chunks.push(chunk));
                doc.on('end', () => resolve(Buffer.concat(chunks)));
                
                // Título
                doc.fontSize(20)
                   .font('Helvetica-Bold')
                   .text(`📊 RELATÓRIO - ${reportData.title}`, { align: 'center' })
                   .moveDown(1);
                
                // Data do relatório
                doc.fontSize(10)
                   .font('Helvetica')
                   .text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, { align: 'right' })
                   .moveDown(1);
                
                // Tabela
                if (reportData.headers && reportData.data) {
                    // Cabeçalho da tabela
                    const tableTop = doc.y;
                    const colWidths = reportData.columnWidths || reportData.headers.map(() => 100);
                    
                    doc.fontSize(10).font('Helvetica-Bold');
                    
                    reportData.headers.forEach((header, i) => {
                        doc.text(header, 50 + colWidths.slice(0, i).reduce((a, b) => a + b, 0), tableTop, {
                            width: colWidths[i],
                            align: 'left'
                        });
                    });
                    
                    doc.moveDown(0.5);
                    
                    // Linha separadora
                    doc.moveTo(50, doc.y)
                       .lineTo(50 + colWidths.reduce((a, b) => a + b, 0), doc.y)
                       .stroke();
                    
                    // Dados da tabela
                    doc.fontSize(9).font('Helvetica');
                    
                    reportData.data.forEach((row, rowIndex) => {
                        const rowY = doc.y;
                        
                        row.forEach((cell, colIndex) => {
                            doc.text(
                                String(cell),
                                50 + colWidths.slice(0, colIndex).reduce((a, b) => a + b, 0),
                                rowY,
                                { width: colWidths[colIndex], align: 'left' }
                            );
                        });
                        
                        // Alternar cores de fundo (simulado com linhas)
                        if (rowIndex % 2 === 1) {
                            doc.rect(50, rowY - 2, colWidths.reduce((a, b) => a + b, 0), 15)
                               .fillOpacity(0.1)
                               .fill()
                               .fillOpacity(1);
                        }
                        
                        doc.moveDown(0.3);
                        
                        // Nova página se necessário
                        if (doc.y > 700) {
                            doc.addPage();
                        }
                    });
                }
                
                // Rodapé
                doc.moveDown(2);
                doc.fontSize(8)
                   .font('Helvetica-Oblique')
                   .text('Doguinha Store - Relatório Gerado Automaticamente', { align: 'center' });
                
                doc.end();
                
            } catch (error) {
                reject(error);
            }
        });
    }
}

module.exports = PDFGenerator;
