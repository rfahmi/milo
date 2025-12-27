const express = require('express');
const config = require('./config');
const client = require('./gateway/client');
const registerCommands = require('./gateway/register');
const db = require('./data/db');

async function main() {
  try {
    console.log('Starting Milo...');
    config.validateEnv();

    // Initialize DB
    db.initSchema();

    // Register commands on startup
    await registerCommands();

    // Start Discord Client
    await client.login();

    // Optional: Health check server for Railway/Docker
    const app = express();
    const port = process.env.PORT || 8080;

    app.get('/', (req, res) => {
      res.send('Milo is running.');
    });

    app.get('/health', (req, res) => {
      res.status(200).send('OK');
    });

    app.listen(port, '0.0.0.0', () => {
      console.log(`Health check server listening on port ${port}`);
    });

  } catch (error) {
    console.error('Failed to start application:', error);
    process.exit(1);
  }
}

main();
