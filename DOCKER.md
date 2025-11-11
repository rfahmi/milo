# Running Milo with Docker

## Quick Start

### Option 1: Using the run script (Recommended for first time)

```bash
# 1. Copy and configure environment
cp .env.example .env
nano .env  # Fill in your Discord and Gemini credentials

# 2. Run the container
./run-docker.sh
```

### Option 2: Using docker-compose (Recommended for production)

```bash
# 1. Configure environment
cp .env.example .env
nano .env

# 2. Start services
docker-compose up -d

# 3. Initialize database
docker exec milo php /var/www/html/init_db.php

# 4. Register Discord commands
export $(cat .env | xargs)
php register_commands.php
```

### Option 3: Manual Docker commands

```bash
# Build
docker build -t milo .

# Run
docker run -d \
  -p 8080:80 \
  --env-file .env \
  -v $(pwd)/data:/var/www/html/data \
  --name milo \
  milo

# Initialize database
docker exec milo php /var/www/html/init_db.php
```

---

## Accessing the Discord Interactions Endpoint

The Discord interactions endpoint is available at:
```
http://localhost:8080/src/discord_interactions.php
```

### For Local Development: Use ngrok

Discord requires HTTPS, so use ngrok to expose your local endpoint:

```bash
# Install ngrok (macOS)
brew install ngrok

# Expose port 8080
ngrok http 8080
```

You'll see output like:
```
Forwarding  https://abc123.ngrok.io -> http://localhost:8080
```

**Set this URL in Discord:**
1. Go to Discord Developer Portal → Your Application
2. General Information → Interactions Endpoint URL
3. Enter: `https://abc123.ngrok.io/src/discord_interactions.php`
4. Click "Save Changes" (Discord will verify it automatically)

### For Production: Use a real domain

Deploy to a server with HTTPS enabled and set:
```
https://yourdomain.com/src/discord_interactions.php
```

---

## Managing the Container

### View logs
```bash
docker logs -f milo
```

### Run message processing manually
```bash
docker exec milo php /var/www/html/src/cron_process_messages.php
```

### Access container shell
```bash
docker exec -it milo bash
```

### Stop/Start/Restart
```bash
docker stop milo
docker start milo
docker restart milo
```

### Remove container
```bash
docker stop milo
docker rm milo
```

---

## Setting Up Automated Message Processing

### Option A: Cron on host machine

```bash
# Edit crontab
crontab -e

# Add this line to run every minute:
* * * * * docker exec milo php /var/www/html/src/cron_process_messages.php >> /var/log/milo-cron.log 2>&1
```

### Option B: Use docker-compose with cron service

The included `docker-compose.yml` has a `milo-cron` service that handles this automatically:

```bash
docker-compose up -d

# View cron logs
docker logs -f milo-cron
```

---

## Testing the Endpoint

### Test locally
```bash
curl http://localhost:8080/src/discord_interactions.php
```

Expected response: `invalid request` (this is normal - Discord requests require proper signatures)

### Test through ngrok
```bash
curl https://your-ngrok-url.ngrok.io/src/discord_interactions.php
```

### Test Discord integration
In your Discord channel:
1. Type `/checkpoint`
2. Upload a receipt image
3. Wait ~1 minute for processing
4. Type `/checkpoint` again to see the summary

---

## Troubleshooting

### Container won't start
```bash
# Check logs
docker logs milo

# Verify environment variables
docker exec milo env | grep DISCORD
```

### Endpoint returns 401
- Discord signature verification failed
- Check `DISCORD_PUBLIC_KEY` is correct in `.env`

### Commands not showing in Discord
- Wait 5-10 minutes after registration
- Run `php register_commands.php` again
- Check `DISCORD_APPLICATION_ID` and `DISCORD_BOT_TOKEN`

### Images not being processed
- Check cron is running: `docker exec milo ps aux | grep cron`
- Manually run: `docker exec milo php /var/www/html/src/cron_process_messages.php`
- Check Gemini API key is valid

### Database permissions
```bash
docker exec milo ls -la /var/www/html/data
docker exec milo chown -R www-data:www-data /var/www/html/data
```

---

## Port Configuration

By default, the container exposes port 80 internally and maps to 8080 on your host:

- **Change host port**: Edit `-p 8080:80` to `-p YOUR_PORT:80`
- **Access endpoint**: `http://localhost:YOUR_PORT/src/discord_interactions.php`
