#!/bin/bash
# Fix database directory and file permissions at startup

if [ -n "$DB_PATH" ]; then
    DB_DIR="$(dirname "$DB_PATH")"
    echo "Database path: $DB_PATH"
    echo "Database directory: $DB_DIR"
    
    # Check if directory exists and is writable
    if [ -d "$DB_DIR" ]; then
        echo "Directory exists, checking permissions..."
        ls -lad "$DB_DIR"
        
        # Try to create a test file to check write permissions
        if ! touch "$DB_DIR/.write_test" 2>/dev/null; then
            echo "ERROR: Directory is not writable by current user ($(whoami))"
            echo "Attempting to fix permissions..."
            chmod 777 "$DB_DIR" 2>/dev/null || echo "Could not change directory permissions (need root)"
        else
            echo "Directory is writable"
            rm -f "$DB_DIR/.write_test"
        fi
        
        # If database file exists, check its permissions
        if [ -f "$DB_PATH" ]; then
            echo "Database file exists:"
            ls -la "$DB_PATH"
            chmod 666 "$DB_PATH" 2>/dev/null || echo "Could not change file permissions"
        fi
    else
        echo "Directory does not exist, attempting to create..."
        mkdir -p "$DB_DIR" 2>/dev/null || echo "Could not create directory"
    fi
fi

echo "Starting application..."
# Start the app
exec "$@"
