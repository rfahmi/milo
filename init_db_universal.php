<?php
// Milo - initialize database schema (PostgreSQL and SQLite compatible)
require_once __DIR__ . '/src/helpers.php';

$db = get_db();
$isPostgres = is_postgres();

if ($isPostgres) {
    echo "Using PostgreSQL database\n";
    
    // PostgreSQL schema
    $db->exec("
        CREATE TABLE IF NOT EXISTS checkpoints (
          id SERIAL PRIMARY KEY,
          channel_id TEXT,
          created_at TEXT,
          closed_at TEXT,
          start_message_id TEXT,
          end_message_id TEXT
        );
    ");

    $db->exec("
        CREATE TABLE IF NOT EXISTS receipts (
          id SERIAL PRIMARY KEY,
          user_id TEXT,
          user_name TEXT,
          channel_id TEXT,
          checkpoint_id INTEGER REFERENCES checkpoints(id),
          message_id TEXT,
          image_url TEXT,
          amount REAL,
          created_at TEXT
        );
    ");

    $db->exec("
        CREATE TABLE IF NOT EXISTS channel_state (
          channel_id TEXT PRIMARY KEY,
          last_message_id TEXT
        );
    ");
    
    echo "PostgreSQL database initialized\n";
} else {
    echo "Using SQLite database at " . DB_PATH . "\n";
    
    // SQLite schema
    $db->exec("
        CREATE TABLE IF NOT EXISTS checkpoints (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          channel_id TEXT,
          created_at TEXT,
          closed_at TEXT,
          start_message_id TEXT,
          end_message_id TEXT
        );
    ");

    $db->exec("
        CREATE TABLE IF NOT EXISTS receipts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id TEXT,
          user_name TEXT,
          channel_id TEXT,
          checkpoint_id INTEGER,
          message_id TEXT,
          image_url TEXT,
          amount REAL,
          created_at TEXT,
          FOREIGN KEY(checkpoint_id) REFERENCES checkpoints(id)
        );
    ");

    $db->exec("
        CREATE TABLE IF NOT EXISTS channel_state (
          channel_id TEXT PRIMARY KEY,
          last_message_id TEXT
        );
    ");
    
    echo "SQLite database initialized at " . DB_PATH . "\n";
}

echo "Database schema ready!\n";
