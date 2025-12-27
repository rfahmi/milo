# Milo

Milo is a tiny Discord bot to help you and your family track shared expenses from receipt screenshots. This repository contains a feature‑equivalent reimplementation of the original PHP project in Node.js, refactored for **Clean Architecture** and **Discord Gateway** usage.

## Features

- **Real-time Processing**: Listens to messages via Discord Gateway. No polling or cron jobs.
- **AI-Powered**: Uses Google Gemini to extract totals from receipt images.
- **Sassy Feedback**: Milo (the cat persona) will roast you if you upload non-receipt images.
- **SQLite Persistence**: Data is durable and stored in a local SQLite database (`/data/receipts.db`).

## Commands

- `/start`: Start a new checkpoint tracking window.
- `/end`: Close the active checkpoint and show a summary per user.
- `/status`: Show the current running total without closing.
- `/undo`: Undo the latest checkpoint (if empty).
- `/admin init`: Manually initialize the database schema (Admins only).
- `/admin ping`: Check bot health and latency (Admins only).

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
