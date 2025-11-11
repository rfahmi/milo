# Milo

Milo is a tiny Discord bot to help you and your family track shared expenses from receipt screenshots.

## Core idea

- Use `/checkpoint` to start a tracking window.
- Everyone just drops receipt images in the Discord channel.
- A cron job polls new messages, sends images to **Gemini** to read the total, and logs them into SQLite.
- When you run `/checkpoint` again, Milo closes the checkpoint and shows a summary of totals **per user**.
- `/undo` lets you undo the latest checkpoint if nothing happened after it.

## Files

- `src/config.php` – reads configuration from environment variables.
- `src/helpers.php` – shared helpers (DB, Gemini, Discord utilities).
- `src/discord_interactions.php` – HTTP endpoint that Discord calls for slash commands.
- `src/cron_process_messages.php` – CLI script to poll Discord messages and log receipts.
- `init_db.php` – one-time (or idempotent) script to create SQLite tables.
- `Dockerfile` – builds a PHP-Apache image with Milo inside.
- `.github/workflows/docker-publish.yml` – GitHub Actions workflow to build & push the Docker image to Docker Hub.

## Environment variables

Set these in your hosting / container / CI:

- `DISCORD_PUBLIC_KEY` – your application's public key from Discord Developer Portal.
- `DISCORD_BOT_TOKEN` – bot token.
- `DISCORD_CHANNEL_ID` – the ID of the channel you want Milo to watch.
- `GEMINI_API_KEY` – your Gemini API key.
- `GEMINI_MODEL` – (optional) model name, defaults to `gemini-1.5-pro`.
- `DATABASE_URL` – (optional) PostgreSQL connection string for persistent data (recommended for production).
- `DB_PATH` – (optional) path to SQLite DB, defaults to `data/receipts.db` (used if `DATABASE_URL` not set).

## Database initialization

The bot supports both PostgreSQL (recommended for production) and SQLite (for local development).

**For SQLite (default):**
```bash
php init_db.php
```

**For PostgreSQL or auto-detect:**
```bash
php init_db_universal.php
```

This will create the database tables. See `POSTGRES.md` for setting up persistent PostgreSQL on Render.

## Discord setup

1. Create a new application in Discord Developer Portal.
2. Add a **Bot** user and record:
   - Bot token
   - Public key
3. Invite the bot to your server with a URL that includes:
   - Scopes: `bot`, `applications.commands`
   - Permissions: at least `Send Messages` and `Read Messages/View Channel`.
4. In the **Interactions** tab, set the **Interactions Endpoint URL** to the URL of:
   - `src/discord_interactions.php` exposed via your web server (for example `https://yourdomain.com/discord_interactions.php`).

### Slash commands to create in your app

Define these application commands in the Developer Portal:

- `/checkpoint` – no options. Starts or closes a checkpoint and prints a summary when closing.
- `/undo` – no options. Undoes the latest checkpoint if no messages were seen after it.

## Cron job (message polling)

The cron job is what scans the Discord channel for new messages and logs image receipts.

Example cron entry (Linux):

```cron
* * * * * /usr/bin/php -q /path/to/repo/src/cron_process_messages.php > /dev/null 2>&1
```

Adjust paths and PHP binary location to your environment.

## Docker

Build locally:

```bash
docker build -t rfahmi/milo:local .
```

Run:

```bash
docker run -p 8080:80 \
  -e DISCORD_PUBLIC_KEY=... \
  -e DISCORD_BOT_TOKEN=... \
  -e DISCORD_CHANNEL_ID=... \
  -e GEMINI_API_KEY=... \
  --name milo rfahmi/milo:local
```

You still need a cron job *somewhere* to invoke:

```bash
docker exec milo php /var/www/html/src/cron_process_messages.php
```

For example, add a cron entry on the Docker host that calls `docker exec`.

## GitHub Actions → Docker Hub

The workflow `.github/workflows/docker-publish.yml` expects:

- `DOCKERHUB_USERNAME`
- `DOCKERHUB_TOKEN`

as GitHub repository secrets.

Whenever you push to `main` or `master`, it will:

- Build the Docker image.
- Push it to Docker Hub as:

  - `${DOCKERHUB_USERNAME}/milo:latest`
  - `${DOCKERHUB_USERNAME}/milo:<git-sha>`

## License

MIT-licensed. Use, fork, and hack it as you like.
