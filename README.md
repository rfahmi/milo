# Milo (Node.js version)

Milo is a tiny Discord bot to help you and your family track shared
expenses from receipt screenshots. This repository contains a
feature‑equivalent reimplementation of the original PHP project in
Node.js. All commands, environment variables and the recommended
Docker invocation remain the same to ease migration.

## Core idea

- Use `/start` (equivalent to `/checkpoint` in the PHP version) to
  begin a tracking window.
- Everyone just drops receipt images in the designated Discord
  channel.
- A cron job polls new messages, sends images to **Gemini** to read
  the total, and logs them into SQLite or PostgreSQL.
- When you run `/end` the bot closes the checkpoint and shows a
  summary of totals **per user**.
- `/undo` lets you undo the latest checkpoint if nothing happened
  after it.
- `/status` prints the running total without closing the checkpoint.

## Files

- `src/helpers.js` – configuration, database access, Gemini and Discord
  helpers.
- `src/index.js` – Express server that handles slash commands.
- `src/cron_process_messages.js` – CLI script to poll Discord
  messages and log receipts.
- `init_db.js` – one‑time script to create tables when using SQLite.
- `init_db_universal.js` – drop and recreate tables for SQLite or
  PostgreSQL.
- `register_commands.js` – register slash commands with Discord.
- `Dockerfile` – builds a Node.js image with Milo inside.

## Environment variables

Set these in your hosting environment or when running the Docker
container:

- `DISCORD_PUBLIC_KEY` – your application's public key from Discord Developer
  Portal.
- `DISCORD_BOT_TOKEN` – bot token.
- `DISCORD_CHANNEL_ID` – the ID of the channel you want Milo to watch.
- `DISCORD_APPLICATION_ID` – application ID required for registering commands.
- `GEMINI_API_KEY` – your Gemini API key.
- `GEMINI_MODEL` – (optional) model name, defaults to `gemini-2.5-flash`.
- `DATABASE_URL` – (optional) PostgreSQL connection string for persistent
  data (recommended for production).
- `DB_PATH` – (optional) path to SQLite DB, defaults to `data/receipts.db`
  (used if `DATABASE_URL` not set).

You can copy `.env.example` to `.env` and fill in your values.

## Database initialisation

The bot supports both PostgreSQL (recommended for production) and
SQLite (for local development).

**For SQLite (default):**

```bash
npm run init-db
```

**For PostgreSQL or auto‑detect:**

```bash
npm run init-db-universal
```

This will create the database tables. Run the script inside your
container or environment where the `DATABASE_URL` points to a valid
Postgres instance.

## Discord setup

1. Create a new application in the Discord Developer Portal.
2. Add a **Bot** user and record:
   - Bot token
   - Public key
3. Invite the bot to your server with a URL that includes:
   - Scopes: `bot`, `applications.commands`
   - Permissions: at least `Send Messages` and `Read Messages/View Channel`.
4. In the **Interactions** tab, set the **Interactions Endpoint URL** to
   the URL of your server exposing `/discord_interactions` (for example
   `https://yourdomain.com/discord_interactions`).

### Slash commands to create

Register these application commands in the Developer Portal or run

```bash
npm run register-commands
```

The commands are:

- `/start` – no options. Starts a new checkpoint.
- `/end` – no options. Closes the active checkpoint and prints a summary.
- `/status` – no options. Shows the current running total without closing.
- `/undo` – no options. Undoes the latest checkpoint if nothing happened after it.

## Cron job (message polling)

The cron job scans the Discord channel for new messages and logs
image receipts. Run it periodically (e.g. every minute) outside of
the HTTP server:

```cron
* * * * * /usr/bin/node /path/to/repo/src/cron_process_messages.js > /dev/null 2>&1
```

Adjust paths and the Node binary location to your environment. You can
also invoke it with `docker exec` against a running container (see
below).

## Docker

Build locally:

```bash
docker build -t milo:local .
```

Run (environment variables set via `-e` flags):

```bash
docker run -p 8080:80 \
  -e DISCORD_PUBLIC_KEY=... \
  -e DISCORD_BOT_TOKEN=... \
  -e DISCORD_CHANNEL_ID=... \
  -e GEMINI_API_KEY=... \
  --name milo milo:local
```

The server listens on port 80 inside the container, so port 8080 on
your host will serve the `/discord_interactions` endpoint. You still
need a cron job **somewhere** to invoke the message processor:

```bash
docker exec milo node src/cron_process_messages.js
```

For example, add a cron entry on the Docker host that calls
`docker exec` periodically.

## License

MIT. Use, fork and hack it as you like.