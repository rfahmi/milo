#!/bin/bash
# Fix database file permissions if needed

if [ -n "$DB_PATH" ] && [ -f "$DB_PATH" ]; then
    echo "Checking permissions for $DB_PATH"
    
    # Try to make the file writable
    chmod 666 "$DB_PATH" 2>/dev/null || echo "Could not change file permissions (may need root)"
    
    # Try to make the directory writable
    chmod 777 "$(dirname "$DB_PATH")" 2>/dev/null || echo "Could not change directory permissions (may need root)"
    
    # Show current permissions
    ls -la "$DB_PATH"
    ls -lad "$(dirname "$DB_PATH")"
fi

# Start the app
exec "$@"
