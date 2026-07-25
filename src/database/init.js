const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

let db = null;

async function initializeDatabase() {
    try {
        const SQL = await initSqlJs();
        
        const dbPath = process.env.DB_PATH || path.join(__dirname, '..', '..', 'database', 'store.db');
        
        // Criar pasta database se não existir
        const dbDir = path.dirname(dbPath);
        if (!fs.existsSync(dbDir)) {
            fs.mkdirSync(dbDir, { recursive: true });
        }
        
        // Carregar banco existente ou criar novo
        if (fs.existsSync(dbPath)) {
            const fileBuffer = fs.readFileSync(dbPath);
            db = new SQL.Database(fileBuffer);
        } else {
            db = new SQL.Database();
        }
        
        // Criar tabelas
        db.run(`
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                phone_number TEXT UNIQUE NOT NULL,
                balance REAL DEFAULT 0,
                referral_code TEXT UNIQUE,
                referred_by TEXT,
                referral_link TEXT,
                commission_balance REAL DEFAULT 0,
                total_referrals INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        db.run(`
            CREATE TABLE IF NOT EXISTS products (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                description TEXT,
                price REAL NOT NULL,
                stock INTEGER DEFAULT 0,
                category TEXT,
                active INTEGER DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        db.run(`
            CREATE TABLE IF NOT EXISTS purchases (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                product_id INTEGER,
                product_name TEXT,
                amount REAL,
                status TEXT DEFAULT 'completed',
                credentials TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id),
                FOREIGN KEY (product_id) REFERENCES products(id)
            )
        `);
        
        db.run(`
            CREATE TABLE IF NOT EXISTS pix_recharges (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                amount REAL,
                pix_id TEXT UNIQUE,
                qr_code TEXT,
                copy_paste TEXT,
                status TEXT DEFAULT 'pending',
                expires_at DATETIME,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                paid_at DATETIME,
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
        `);
        
        db.run(`
            CREATE TABLE IF NOT EXISTS referrals (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                referrer_id INTEGER,
                referred_id INTEGER,
                commission_amount REAL DEFAULT 0,
                status TEXT DEFAULT 'active',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (referrer_id) REFERENCES users(id),
                FOREIGN KEY (referred_id) REFERENCES users(id)
            )
        `);
        
        db.run(`
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        db.run(`
            CREATE TABLE IF NOT EXISTS logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                type TEXT,
                user_id INTEGER,
                message TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        // Salvar no disco
        saveDatabase(dbPath);
        
        console.log('✅ Banco de dados inicializado com sucesso!');
        return db;
        
    } catch (error) {
        console.error('❌ Erro ao inicializar banco de dados:', error);
        throw error;
    }
}

function saveDatabase(dbPath) {
    try {
        const data = db.export();
        const buffer = Buffer.from(data);
        const dbDir = path.dirname(dbPath);
        
        if (!fs.existsSync(dbDir)) {
            fs.mkdirSync(dbDir, { recursive: true });
        }
        
        fs.writeFileSync(dbPath, buffer);
    } catch (error) {
        console.error('Erro ao salvar banco de dados:', error);
    }
}

// Auto-save a cada 5 minutos
setInterval(() => {
    if (db) {
        const dbPath = process.env.DB_PATH || path.join(__dirname, '..', '..', 'database', 'store.db');
        saveDatabase(dbPath);
    }
}, 5 * 60 * 1000);

function getDatabase() {
    return db;
}

module.exports = { initializeDatabase, getDatabase, saveDatabase };
