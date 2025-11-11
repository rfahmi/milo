# Discord Bot Integration Guide

## Prerequisites
- PHP 7.4+ with curl extension
- A Discord server where you have admin rights
- Gemini API key

## Step-by-Step Setup

### 1. Discord Developer Portal Setup

1. Go to https://discord.com/developers/applications
2. Click "New Application" and name it (e.g., "Milo")
3. **Copy your Application ID and Public Key** (from General Information tab)
4. Go to "Bot" tab:
   - Click "Add Bot"
   - Under "Privileged Gateway Intents", enable:
     - MESSAGE CONTENT INTENT
   - Copy the **Bot Token**
5. Go to "OAuth2" → "URL Generator":
   - Select scopes: `bot`, `applications.commands`
   - Select permissions: `Read Messages/View Channels`, `Send Messages`, `Read Message History`
   - Copy the generated URL and open it to invite the bot to your server

### 2. Get Channel ID

1. In Discord, enable Developer Mode (User Settings → Advanced → Developer Mode)
2. Right-click on the channel you want to monitor → Copy ID

### 3. Configure Environment

```bash
# Copy the example env file
cp .env.example .env

# Edit .env with your actual values
nano .env
```

Fill in:
- `DISCORD_APPLICATION_ID` - from step 1.3
- `DISCORD_PUBLIC_KEY` - from step 1.3
- `DISCORD_BOT_TOKEN` - from step 1.4
- `DISCORD_CHANNEL_ID` - from step 2
- `GEMINI_API_KEY` - your Google AI Studio API key

### 4. Initialize Database

```bash
php init_db.php
```

### 5. Register Slash Commands

```bash
# Set environment variables first
export $(cat .env | xargs)

# Register commands
php register_commands.php
```

### 6. Deploy the Interactions Endpoint

#### Option A: Local Development (ngrok)

```bash
# Start ngrok
ngrok http 80

# Note the HTTPS URL (e.g., https://abc123.ngrok.io)
```

Then in Discord Developer Portal:
- Go to "General Information"
- Set "Interactions Endpoint URL" to: `https://abc123.ngrok.io/src/discord_interactions.php`
- Discord will verify it immediately

#### Option B: Production Deployment

Deploy `src/discord_interactions.php` to your web server and set the Interactions Endpoint URL to your public URL.

### 7. Set Up Cron Job for Message Processing

```bash
# Add to crontab (runs every minute)
crontab -e

# Add this line:
* * * * * cd /path/to/milo && /usr/bin/php src/cron_process_messages.php >> logs/cron.log 2>&1
```

## Using Docker

```bash
# Build
docker build -t milo .

# Run
docker run -d -p 8080:80 \
  --env-file .env \
  -v $(pwd)/data:/var/www/html/data \
  --name milo \
  milo

# Set up cron on host to process messages
crontab -e
# Add: * * * * * docker exec milo php /var/www/html/src/cron_process_messages.php
```

## Testing

In your Discord channel:
1. Type `/checkpoint` - should start a checkpoint
2. Upload a receipt image
3. Wait a minute for cron to process
4. Type `/checkpoint` again - should show summary
5. Type `/undo` - should undo the checkpoint

## Troubleshooting

- **Commands not showing**: Wait 5-10 minutes or try re-inviting the bot
- **Interactions failing**: Check that your endpoint URL is HTTPS and publicly accessible
- **Images not processing**: Verify cron is running and check logs
- **Database errors**: Ensure `data/` directory is writable

## Support

For issues, check:
- Discord webhook logs in Developer Portal
- PHP error logs
- `logs/cron.log` for cron job output
