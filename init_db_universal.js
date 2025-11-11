// Milo - initialise database schema for SQLite and Postgres
//
// This script drops existing tables and recreates them for a clean
// start. It works for both PostgreSQL and SQLite backends. Use with
// caution: existing data will be lost.

require('dotenv').config();
const { getDB, isPostgres, run } = require('./src/helpers');

(async () => {
  const conn = await getDB();
  const postgres = isPostgres(conn);
  try {
    if (postgres) {
      console.log('Using PostgreSQL database');
      console.log('Dropping existing tables...');
      await conn.client.query('DROP TABLE IF EXISTS receipts CASCADE');
      await conn.client.query('DROP TABLE IF EXISTS checkpoints CASCADE');
      await conn.client.query('DROP TABLE IF EXISTS channel_state CASCADE');
      console.log('Creating fresh tables...');
      await conn.client.query(`
        CREATE TABLE checkpoints (
          id SERIAL PRIMARY KEY,
          channel_id TEXT,
          created_at TEXT,
          closed_at TEXT,
          start_message_id TEXT,
          end_message_id TEXT
        );
      `);
      await conn.client.query(`
        CREATE TABLE receipts (
          id SERIAL PRIMARY KEY,
          user_id TEXT,
          user_name TEXT,
          channel_id TEXT,
          checkpoint_id INTEGER REFERENCES checkpoints(id),
          message_id TEXT,
          image_url TEXT,
          amount REAL,
          created_at TEXT,
          UNIQUE(checkpoint_id, message_id, image_url)
        );
      `);
      await conn.client.query(`
        CREATE TABLE channel_state (
          channel_id TEXT PRIMARY KEY,
          last_message_id TEXT
        );
      `);
      console.log('PostgreSQL database initialised');
    } else {
      console.log('Using SQLite database at', process.env.DB_PATH || 'data/receipts.db');
      console.log('Dropping existing tables...');
      await run(conn, 'DROP TABLE IF EXISTS receipts', []);
      await run(conn, 'DROP TABLE IF EXISTS checkpoints', []);
      await run(conn, 'DROP TABLE IF EXISTS channel_state', []);
      console.log('Creating fresh tables...');
      await run(
        conn,
        `CREATE TABLE checkpoints (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          channel_id TEXT,
          created_at TEXT,
          closed_at TEXT,
          start_message_id TEXT,
          end_message_id TEXT
        );`,
        []
      );
      await run(
        conn,
        `CREATE TABLE receipts (
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
      await run(
        conn,
        `CREATE TABLE channel_state (
          channel_id TEXT PRIMARY KEY,
          last_message_id TEXT
        );`,
        []
      );
      console.log('SQLite database initialised');
    }
    console.log('Database schema ready!');
  } catch (err) {
    console.error('Error initialising database:', err);
    process.exit(1);
  }
})();