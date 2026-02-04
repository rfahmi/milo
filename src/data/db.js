const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const config = require('../config');

let dbInstance = null;

function ensureDbDirectory() {
    const dir = path.dirname(config.db.path);
    if (!fs.existsSync(dir)) {
        console.log(`Creating database directory: ${dir}`);
        fs.mkdirSync(dir, { recursive: true });
    }
}

function getDb() {
    if (dbInstance) return dbInstance;

    ensureDbDirectory();

    console.log(`Connecting to SQLite database at ${config.db.path}`);
    dbInstance = new sqlite3.Database(config.db.path, (err) => {
        if (err) {
            console.error('Could not connect to database', err);
            process.exit(1);
        }
    });

    dbInstance.serialize(() => {
        // Enable WAL mode for better concurrency and durability
        dbInstance.run('PRAGMA journal_mode = WAL;');
        dbInstance.run('PRAGMA synchronous = NORMAL;');
    });

    return dbInstance;
}

function close() {
    return new Promise((resolve, reject) => {
        if (!dbInstance) return resolve();

        console.log('Closing SQLite connection...');
        dbInstance.close((err) => {
            if (err) {
                console.error('Error closing database:', err.message);
                reject(err);
            } else {
                console.log('Database connection closed.');
                dbInstance = null; // Reset singleton
                resolve();
            }
        });
    });
}

// Promisified helpers
function run(sql, params = []) {
    const db = getDb();
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (err) {
            if (err) reject(err);
            else resolve({ lastID: this.lastID, changes: this.changes });
        });
    });
}

function initSchema() {
    const db = getDb();

    db.serialize(() => {
        // ... (previous CREATE tables) ...
        db.run(`
      CREATE TABLE IF NOT EXISTS checkpoints (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        channel_id TEXT NOT NULL,
        start_message_id TEXT,
        end_message_id TEXT,
        created_at TEXT NOT NULL,
        closed_at TEXT
      )
    `);

        db.run(`
      CREATE TABLE IF NOT EXISTS receipts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        user_name TEXT,
        channel_id TEXT NOT NULL,
        checkpoint_id INTEGER NOT NULL,
        message_id TEXT,
        image_url TEXT,
        amount REAL NOT NULL,
        description TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY(checkpoint_id) REFERENCES checkpoints(id)
      )
    `);

        // Migration: Ensure 'description' column exists for existing tables
        // Simple "try add" approach
        db.run("ALTER TABLE receipts ADD COLUMN description TEXT", (err) => {
            // Ignore error if column already exists
            if (err && !err.message.includes('duplicate column name')) {
                console.log('Migration note:', err.message);
            }
        });

        db.run(`
      CREATE TABLE IF NOT EXISTS channel_state (
        channel_id TEXT PRIMARY KEY,
        last_message_id TEXT
      )
    `);

        db.run(`
      CREATE TABLE IF NOT EXISTS conversation_states (
         user_id TEXT NOT NULL,
         channel_id TEXT NOT NULL,
         state TEXT NOT NULL,
         data TEXT,
         updated_at TEXT NOT NULL,
         PRIMARY KEY (user_id, channel_id)
      )
    `);

        db.run(`
      CREATE TABLE IF NOT EXISTS backup_schedule (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        cron_expression TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
    });

    console.log('Database schema initialized.');
}

function get(sql, params = []) {
    const db = getDb();
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
}

function all(sql, params = []) {
    const db = getDb();
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

module.exports = {
    getDb,
    initSchema,
    run,
    get,
    get,
    all,
    close,
};
