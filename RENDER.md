# Deploy Milo to Render

This guide walks you through deploying the Milo Discord bot to Render using Docker.

## Prerequisites

- A GitHub account with this repository pushed
- A [Render](https://render.com) account (free tier available)
- Discord Application credentials (Application ID, Public Key, Bot Token)
- Gemini API key
- Discord Channel ID

## Deployment Steps

### 1. Push Your Code to GitHub

```bash
# If not already done
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/milo.git
git push -u origin main
```

### 2. Create a New Web Service on Render

1. Go to https://dashboard.render.com
2. Click **"New +"** → **"Web Service"**
3. Connect your GitHub repository (authorize Render if needed)
4. Select the `milo` repository

### 3. Configure the Web Service

Fill in the following settings:

**Basic Settings:**
- **Name:** `milo-discord-bot` (or your preferred name)
- **Region:** Choose closest to you
- **Branch:** `main`
- **Runtime:** `Docker`
- **Docker Build Context Directory:** Leave empty (uses root)
- **Dockerfile Path:** `./Dockerfile`

**Instance Type:**
- Select **"Free"** (or paid if you prefer)

### 4. Add Environment Variables

Click **"Advanced"** and add these environment variables:

| Key | Value | Notes |
|-----|-------|-------|
| `DISCORD_APPLICATION_ID` | Your application ID | From Discord Developer Portal |
| `DISCORD_PUBLIC_KEY` | Your public key | From Discord Developer Portal |
| `DISCORD_BOT_TOKEN` | Your bot token | From Discord Developer Portal → Bot |
| `DISCORD_CHANNEL_ID` | Your channel ID | Right-click channel → Copy ID |
| `GEMINI_API_KEY` | Your Gemini API key | From Google AI Studio |
| `GEMINI_MODEL` | `gemini-1.5-pro` | Optional, defaults to this |
| `DATABASE_URL` | PostgreSQL connection string | **Optional but recommended** - See POSTGRES.md for persistent data |
| `INIT_SECRET` | Random string | For one-time setup (optional, see step 8) |
| `CRON_SECRET` | Random string | For cron endpoint security (optional, see step 10) |

**Generate random secrets:**
```bash
# On Mac/Linux
openssl rand -hex 32
```

Or use any random string generator.

**Note:** If you don't set `DATABASE_URL`, the bot uses SQLite (data lost on redeploy). See **POSTGRES.md** for setting up persistent PostgreSQL storage.

### 5. Configure Health Check (Optional)

Under **"Advanced"**:
- **Health Check Path:** `/index.html`

### 6. Deploy

1. Click **"Create Web Service"**
2. Wait for the deployment to complete (~2-5 minutes)
3. Once deployed, copy your service URL (e.g., `https://milo-discord-bot.onrender.com`)

### 7. Set Discord Interactions Endpoint

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Select your application
3. Go to **"General Information"**
4. Set **"Interactions Endpoint URL"** to:
   ```
   https://YOUR-SERVICE-NAME.onrender.com/src/discord_interactions.php
   ```
   Example: `https://milo-discord-bot.onrender.com/src/discord_interactions.php`
5. Click **"Save Changes"**
6. Discord will verify the endpoint (you should see a green checkmark)

### 8. Initialize Database

**Option A: Via Render Shell (Recommended)**

1. In Render Dashboard → Your Service → Click **"Shell"** tab
2. Run:
   ```bash
   php /var/www/html/init_db.php
   ```

**Option B: Via Web Endpoint**

Create a one-time initialization endpoint:

Add to `.env` in Render:
- `INIT_SECRET`: `your-random-secret-here` (generate with `openssl rand -hex 32`)

Then visit in your browser:
```
https://your-service.onrender.com/src/init_setup.php?secret=your-random-secret-here
```

This will initialize the database and register Discord commands automatically.

### 9. Register Slash Commands

**Option A: Via Render Shell (Recommended)**

1. In Render Dashboard → Your Service → Click **"Shell"** tab
2. Run:
   ```bash
   cd /var/www/html
   php register_commands.php
   ```

**Option B: Via the initialization endpoint (Step 8, Option B)**

If you use the `init_setup.php` endpoint, it will register commands automatically.

**Option C: On your local machine (if you have PHP)**

```bash
# Set environment variables
export DISCORD_APPLICATION_ID=your_app_id
export DISCORD_BOT_TOKEN=your_bot_token

# Run registration script
php register_commands.php
```

This only needs to be done once.

### 10. Set Up Cron Job for Message Processing

Render's free tier doesn't include cron jobs, but you have options:

#### Option A: Use Render Cron Jobs (Paid Plans)

1. Create a new **"Cron Job"** service in Render
2. Use the same repository
3. Set **Command:** 
   ```bash
   php /var/www/html/src/cron_process_messages.php
   ```
4. Set **Schedule:** `* * * * *` (every minute)
5. Add the same environment variables

#### Option B: Use External Cron Service (Free)

Use [cron-job.org](https://cron-job.org) or [EasyCron](https://www.easycron.com):

1. Create a PHP endpoint that triggers the cron:

Create `src/trigger_cron.php`:
```php
<?php
// Simple endpoint to trigger cron processing
// Protect with a secret token

require_once __DIR__ . '/config.php';

$secret = getenv('CRON_SECRET') ?: 'change-me-in-production';
$provided = $_GET['secret'] ?? '';

if ($provided !== $secret) {
    http_response_code(403);
    die('Forbidden');
}

// Run the cron processing
require_once __DIR__ . '/cron_process_messages.php';

echo "Cron job executed successfully";
```

2. Add to Render environment variables:
   - `CRON_SECRET`: `your-random-secret-here`

3. Set up external cron to call:
   ```
   https://your-service.onrender.com/src/trigger_cron.php?secret=your-random-secret-here
   ```
   Schedule: Every 1 minute

#### Option C: Use GitHub Actions (Free)

Create `.github/workflows/cron.yml`:
```yaml
name: Process Discord Messages

on:
  schedule:
    - cron: '* * * * *'  # Every minute
  workflow_dispatch:  # Allow manual trigger

jobs:
  process:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger Render Cron Endpoint
        run: |
          curl -X GET "https://your-service.onrender.com/src/trigger_cron.php?secret=${{ secrets.CRON_SECRET }}"
```

Add `CRON_SECRET` to GitHub repository secrets.

**Note:** GitHub Actions scheduled workflows run at most every 5 minutes on free tier.

## Monitoring and Logs

### View Logs
1. Go to Render Dashboard → Your Service
2. Click **"Logs"** tab
3. View real-time logs

### Check Service Status
- Dashboard shows if service is running
- Access `https://your-service.onrender.com/` to see landing page

### Test the Bot
In your Discord channel:
1. Type `/checkpoint` - should start a checkpoint
2. Upload a receipt image
3. Wait for cron to process (1-5 minutes depending on setup)
4. Type `/checkpoint` again - should show summary

## Troubleshooting

### Interactions Endpoint Verification Failed
- Check that all environment variables are set correctly
- Ensure `DISCORD_PUBLIC_KEY` matches exactly from Developer Portal
- Check Render logs for errors
- Try accessing the endpoint URL directly (should return "invalid request")

### Commands Not Showing in Discord
- Make sure you ran `register_commands.php`
- Wait 5-10 minutes for Discord to sync
- Try re-inviting the bot with the correct permissions

### Images Not Being Processed
- Check that cron job is set up and running
- Verify `GEMINI_API_KEY` is correct
- Check Render logs for errors
- Manually trigger: Visit `/src/trigger_cron.php?secret=YOUR_SECRET`

### Database Errors
- **"could not find driver" error:**
  1. First, check diagnostics: Visit `https://your-service.onrender.com/check_extensions.php`
  2. Ensure your Docker image was rebuilt after updating the Dockerfile
  3. In Render Dashboard, go to **"Manual Deploy"** → **"Clear build cache & deploy"**
  4. Check that `DATABASE_URL` environment variable is set correctly
  5. Verify PostgreSQL extension is loaded by checking logs during deployment
- **General database issues:**
  - Run `php /var/www/html/init_db_universal.php` in Render Shell
  - Check that `/var/www/html/data` directory is writable (SQLite fallback)
- **PostgreSQL not connecting:**
  - Verify `DATABASE_URL` format: `postgres://user:password@host:port/database`
  - For Render PostgreSQL, get the correct connection string from your PostgreSQL service
  - Check Render PostgreSQL service is in the same region and running

### Free Tier Limitations
- Render free tier spins down after 15 minutes of inactivity
- First request after spin-down may take 30-60 seconds
- **SQLite data is lost on redeploy** - Use PostgreSQL for persistence (see POSTGRES.md)
- Consider upgrading for production use

## Cost Estimate

**Free Tier:**
- Web Service: Free (with spin-down)
- Persistent Disk: Not needed (SQLite in container)
- Total: $0/month

**Recommended for Production:**
- Web Service: $7/month (Starter, always on)
- Cron Job: $7/month (for message processing)
- Total: ~$14/month

## Updating Your Deployment

```bash
# Make changes to your code
git add .
git commit -m "Update feature"
git push origin main
```

Render will automatically rebuild and redeploy.

## Alternative: Deploy Pre-built Image from Docker Hub

If you've published to Docker Hub:

1. In Render, create Web Service
2. Choose **"Deploy an existing image from a registry"**
3. Set **Image URL:** `rfahmi/milo:latest`
4. Add environment variables as above

## Support

For issues:
- Check [Render Documentation](https://render.com/docs)
- View Render logs for error messages
- Check Discord Developer Portal webhook logs
- Review this repository's README and SETUP guides
