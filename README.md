# Milo

Milo is a tiny Discord bot to help you and your family track shared expenses from receipt screenshots. This repository contains a feature‑equivalent reimplementation of the original PHP project in Node.js, refactored for **Clean Architecture** and **Discord Gateway** usage.

## Features

- **Real-time Processing**: Listens to messages via Discord Gateway. No polling or cron jobs.
- **AI-Powered**: Uses Google Gemini to extract totals from receipt images.
- **Manual Input**: Submit expenses via text (e.g., "beli baso 15rb"). Milo will parse the amount and ask for a description if missing.
- **Sassy Feedback**: Milo (the cat persona) will roast you if you upload non-receipt images.
- **Backlog Recovery**: Automatically processes any missed receipt images that were sent while the bot was offline.
- **SQLite Persistence**: Data is durable and stored in a local SQLite database (`/data/receipts.db`).

## Commands

- `/start`: Start a new checkpoint tracking window.
- `/end`: Close the active checkpoint and show a summary per user.
- `/status`: Show the current running total without closing.
- `/undo`: Undo the latest checkpoint (if empty).

### Admin Commands (Admins only)

- `/admin init`: Manually initialize the database schema.
- `/admin ping`: Check bot health, latency, and Gemini API status.
- `/admin backup`: Download the current database as a `.db` file.
- `/admin restore`: Upload a `.db` file to replace the current database.
- `/admin refresh-names`: Update all stored usernames to match current Discord display names.
- `/admin delete <number>`: Delete a specific transaction by its number (as shown in `/status`).
- `/admin backup-schedule <cron>`: Set an automated backup schedule using cron syntax (Jakarta timezone).
- `/admin backup-schedule-status`: View the current automated backup schedule and its status.
- `/admin backup-schedule-disable`: Disable the automated backup schedule.

## Setup & Deployment

1. **Clone the repo**
2. **Configure `.env`** (see `.env.example`)
   - `DISCORD_BOT_TOKEN`: Your Bot Token
   - `GEMINI_API_KEY`: Your Google Gemini API Key
3. **Run with Docker**
   ```bash
   docker build -t milo .
   docker run -v $(pwd)/data:/data -p 8080:8080 --env-file .env milo
   ```
   *Note: Port 8080 is exposed for the health check endpoint, but the bot works primarily via WebSocket Gateway.*

## Local Development

1. Install dependencies:
   ```bash
   npm install
   ```
2. Initialize database (optional, happens on start):
   ```bash
   npm run init-db
   ```
3. Register commands (required once or when commands change):
   ```bash
   npm run register-commands
   ```
4. Start the bot:
   ```bash
   npm start
   ```

## Architecture

The project follows a modular structure:
- `src/config`: Configuration management.
- `src/data`: Database layer (SQLite) and Repositories.
- `src/services`: Core logic (Receipts, Gemini AI).
- `src/gateway`: Discord Client and Event handling.
- `src/commands`: Slash command definitions.

## License

MIT.
