<?php
// Milo - initialize database schema (PostgreSQL and SQLite compatible)
require_once __DIR__ . '/src/helpers.php';

$db = get_db();
$isPostgres = is_postgres();

if ($isPostgres) {
    echo "Using PostgreSQL database\n";
    echo "Dropping existing tables...\n";
    
    // Drop tables in correct order (receipts first due to foreign key)
    $db->exec("DROP TABLE IF EXISTS receipts CASCADE");
    $db->exec("DROP TABLE IF EXISTS checkpoints CASCADE");
    $db->exec("DROP TABLE IF EXISTS channel_state CASCADE");
    
    echo "Creating fresh tables...\n";
    
    // PostgreSQL schema
    $db->exec("
        CREATE TABLE checkpoints (
          id SERIAL PRIMARY KEY,
          channel_id TEXT,
          created_at TEXT,
          closed_at TEXT,
          start_message_id TEXT,
          end_message_id TEXT
        );
    ");

    $db->exec("
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
    ");

    $db->exec("
        CREATE TABLE channel_state (
          channel_id TEXT PRIMARY KEY,
          last_message_id TEXT
        );
    ");
    
    echo "PostgreSQL database initialized\n";
} else {
    echo "Using SQLite database at " . DB_PATH . "\n";
    echo "Dropping existing tables...\n";
    
    // Drop tables in correct order (receipts first due to foreign key)
    $db->exec("DROP TABLE IF EXISTS receipts");
    $db->exec("DROP TABLE IF EXISTS checkpoints");
    $db->exec("DROP TABLE IF EXISTS channel_state");
    
    echo "Creating fresh tables...\n";
    
    // SQLite schema
    $db->exec("
        CREATE TABLE checkpoints (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          channel_id TEXT,
          created_at TEXT,
          closed_at TEXT,
          start_message_id TEXT,
          end_message_id TEXT
        );
    ");

    $db->exec("
        CREATE TABLE receipts (
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
        );
    ");

    $db->exec("
        CREATE TABLE channel_state (
          channel_id TEXT PRIMARY KEY,
          last_message_id TEXT
        );
    ");
    
    echo "SQLite database initialized at " . DB_PATH . "\n";
}

echo "Database schema ready!\n";
