<?php
// Migration: Add unique constraint to receipts table to prevent duplicate entries
require_once __DIR__ . '/src/helpers.php';

$db = get_db();
$isPostgres = is_postgres();

echo "Starting migration to add unique constraint...\n";

if ($isPostgres) {
    echo "PostgreSQL detected\n";
    
    // Check if constraint already exists
    $stmt = $db->query("
        SELECT constraint_name 
        FROM information_schema.table_constraints 
        WHERE table_name = 'receipts' 
        AND constraint_type = 'UNIQUE'
        AND constraint_name LIKE '%checkpoint_id%message_id%image_url%'
    ");
    
    if ($stmt->rowCount() > 0) {
        echo "Unique constraint already exists. Skipping.\n";
    } else {
        // First, remove any existing duplicates (keep the first occurrence)
        echo "Removing duplicate entries...\n";
        $db->exec("
            DELETE FROM receipts a
            USING receipts b
            WHERE a.id > b.id
            AND a.checkpoint_id = b.checkpoint_id
            AND a.message_id = b.message_id
            AND a.image_url = b.image_url
        ");
        
        // Add unique constraint
        echo "Adding unique constraint...\n";
        $db->exec("
            ALTER TABLE receipts
            ADD CONSTRAINT receipts_unique_checkpoint_message_image
            UNIQUE (checkpoint_id, message_id, image_url)
        ");
        
        echo "Unique constraint added successfully!\n";
    }
} else {
    echo "SQLite detected\n";
    
    // SQLite doesn't support adding constraints to existing tables
    // We need to recreate the table
    
    echo "Checking if constraint already exists...\n";
    $stmt = $db->query("SELECT sql FROM sqlite_master WHERE type='table' AND name='receipts'");
    $tableDef = $stmt->fetchColumn();
    
    if (strpos($tableDef, 'UNIQUE') !== false) {
        echo "Unique constraint already exists. Skipping.\n";
    } else {
        echo "Recreating receipts table with unique constraint...\n";
        
        // Begin transaction
        $db->beginTransaction();
        
        try {
            // Create new table with unique constraint
            $db->exec("
                CREATE TABLE receipts_new (
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
                )
            ");
            
            // Copy unique data from old table to new table
            echo "Copying unique data...\n";
            $db->exec("
                INSERT OR IGNORE INTO receipts_new 
                SELECT * FROM receipts
                ORDER BY id ASC
            ");
            
            // Drop old table
            $db->exec("DROP TABLE receipts");
            
            // Rename new table
            $db->exec("ALTER TABLE receipts_new RENAME TO receipts");
            
            $db->commit();
            echo "Table recreated successfully with unique constraint!\n";
        } catch (Exception $e) {
            $db->rollBack();
            echo "Error during migration: " . $e->getMessage() . "\n";
            exit(1);
        }
    }
}

echo "\nMigration completed successfully!\n";
echo "Messages will no longer be counted twice in different checkpoints.\n";
