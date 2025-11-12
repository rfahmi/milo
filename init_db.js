// Milo - initialize database schema (SQLite default)
//
// This script creates the necessary tables when using SQLite. For
// PostgreSQL or to reset the schema, use init_db_universal.js instead.

require('dotenv').config();
const { getDB, isPostgres, run } = require('./src/helpers');

(async () => {
  const conn = await getDB();
  if (isPostgres(conn)) {
    console.log('Detected PostgreSQL. Please run init_db_universal.js instead.');
    process.exit(0);
  }
  try {
    // Create checkpoints table
    await run(
      conn,
      `CREATE TABLE IF NOT EXISTS checkpoints (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        channel_id TEXT,
        created_at TEXT,
        closed_at TEXT,
        start_message_id TEXT,
        end_message_id TEXT
      );`,
      []
    );
    // Create receipts table
    await run(
      conn,
      `CREATE TABLE IF NOT EXISTS receipts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT,
        user_name TEXT,
        channel_id TEXT,
        checkpoint_id INTEGER,
        message_id TEXT,
        image_url TEXT,
        amount REAL,
        created_at TEXT,
        FOREIGN KEY(checkpoint_id) REFERENCES checkpoints(id),
        UNIQUE(checkpoint_id, message_id, image_url)
      );`,
      []
    );
    // Create channel_state table
    await run(
      conn,
      `CREATE TABLE IF NOT EXISTS channel_state (
        channel_id TEXT PRIMARY KEY,
        last_message_id TEXT
      );`,
      []
    );
    console.log(`Database initialized at ${process.env.DB_PATH || 'data/receipts.db'}`);
  } catch (err) {
    console.error('Failed to initialise database:', err);
    process.exit(1);
  }
})();