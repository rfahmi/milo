const db = require('./db');

try {
    console.log('Running standalone database initialization...');
    db.initSchema();
    // Allow time for execution before exit since db.run is async but serialized
    // In a real script we might want to wait for a promise, but initSchema is synchronous-ish (queues ops)
    // db.js initSchema logs directly.

    // We can just exit after a short timeout or rely on the process ending naturally if no handles are open,
    // but sqlite3 keeps the handle open.
    setTimeout(() => {
        console.log('Done.');
        process.exit(0);
    }, 1000);
} catch (error) {
    console.error('Database initialization failed:', error);
    process.exit(1);
}
