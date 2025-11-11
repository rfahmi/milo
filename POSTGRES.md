# PostgreSQL Setup for Render (Data Persistence)

This guide shows you how to use Render's free PostgreSQL database for persistent data storage instead of SQLite.

## Why PostgreSQL?

**SQLite (default):**
- ❌ Data lost on every deployment
- ✅ Simple, no setup needed
- ✅ Good for testing

**PostgreSQL:**
- ✅ Data persists across deployments
- ✅ Free tier available on Render
- ✅ Production-ready
- ❌ Requires initial setup

## Setup Steps

### 1. Create PostgreSQL Database on Render

1. Go to [Render Dashboard](https://dashboard.render.com)
2. Click **"New +"** → **"PostgreSQL"**
3. Configure:
   - **Name:** `milo-db` (or your preference)
   - **Database:** `milo` (or leave default)
   - **User:** (auto-generated)
   - **Region:** Same as your web service
   - **PostgreSQL Version:** 16 (or latest)
   - **Plan:** **Free**

4. Click **"Create Database"**
5. Wait for provisioning (~1-2 minutes)

### 2. Get Database Connection String

1. In the PostgreSQL database page, find the **"Connections"** section
2. Copy the **"Internal Database URL"** 
   - Format: `postgres://user:password@host:port/database`
   - Use **Internal** URL (faster, free internal network)
   - **Important:** Render provides this in the correct format for PHP PDO

**Example format:**
```
postgres://milo_user:abc123xyz@dpg-xxxxx-a.oregon-postgres.render.com/milo_db
```

### 3. Add DATABASE_URL to Web Service

1. Go to your Milo web service in Render Dashboard
2. Click **"Environment"** in the left sidebar
3. Click **"Add Environment Variable"**
4. Add:
   - **Key:** `DATABASE_URL`
   - **Value:** Paste the Internal Database URL from step 2
5. Click **"Save Changes"**

**Important:** After adding this variable, you MUST rebuild with a clean cache:
1. Go to **"Manual Deploy"** → **"Clear build cache & deploy"**
2. This ensures the Docker image is rebuilt with PostgreSQL extensions

The service will redeploy with PostgreSQL support.

### 4. Initialize Database Schema

After the service redeploys, run ONE of these:

**Option A: Via init_setup endpoint**
```
https://your-service.onrender.com/src/init_setup.php?secret=YOUR_INIT_SECRET
```

**Option B: Via Render Shell**
1. Go to web service → **"Shell"** tab
2. Run:
   ```bash
   php /var/www/html/init_db_universal.php
   ```

You should see: "Using PostgreSQL database" ✅

### 5. Verify Database

Check with debug endpoint:
```
https://your-service.onrender.com/src/debug.php?secret=YOUR_CRON_SECRET
```

Look for:
```json
{
  "database": {
    "type": "PostgreSQL",
    "connection_string": "PostgreSQL (DATABASE_URL set)",
    ...
  }
}
```

## Complete Environment Variables

Your Render web service should have:

| Variable | Value |
|----------|-------|
| `DATABASE_URL` | `postgres://user:pass@host:5432/db` (from PostgreSQL service) |
| `DISCORD_APPLICATION_ID` | Your Discord app ID |
| `DISCORD_PUBLIC_KEY` | Your Discord public key |
| `DISCORD_BOT_TOKEN` | Your Discord bot token |
| `DISCORD_CHANNEL_ID` | Your Discord channel ID |
| `GEMINI_API_KEY` | Your Gemini API key |
| `GEMINI_MODEL` | `gemini-1.5-pro` |
| `INIT_SECRET` | Random string for setup endpoint |
| `CRON_SECRET` | Random string for cron endpoint |

## Migration from SQLite

If you have existing data in SQLite, you'll need to manually migrate:

1. Export data from SQLite (if needed)
2. Set up PostgreSQL (above steps)
3. Initialize new PostgreSQL schema
4. Optionally import old data

For a receipt tracking bot, it's usually fine to just start fresh.

## Database Management

### View Data in Render

1. Go to PostgreSQL service in Render
2. Click **"Connect"** → **"External Connection"**
3. Use any PostgreSQL client (pgAdmin, TablePlus, DBeaver, etc.)

### Reset Database

If you need to start over:

**Option 1: Drop and recreate tables**
```sql
DROP TABLE IF EXISTS receipts CASCADE;
DROP TABLE IF EXISTS checkpoints CASCADE;
DROP TABLE IF EXISTS channel_state CASCADE;
```

Then run `init_db_universal.php` again.

**Option 2: Delete and recreate PostgreSQL service**
- Easier but requires updating `DATABASE_URL` environment variable

## Troubleshooting

### "could not find driver" Error

**Symptom:** 
```json
{
  "database": {
    "status": "error",
    "message": "PostgreSQL connection failed: could not find driver"
  }
}
```

**Solutions:**
1. **Check if extensions are loaded:**
   - Visit: `https://your-service.onrender.com/check_extensions.php`
   - Look for `"pdo_pgsql_loaded": true`

2. **Rebuild with clean cache:**
   - Go to Render Dashboard → Your web service
   - Click **"Manual Deploy"** → **"Clear build cache & deploy"**
   - This forces a complete rebuild of the Docker image with PostgreSQL extensions

3. **Verify Dockerfile has PostgreSQL support:**
   - Check that your Dockerfile includes `pdo_pgsql` installation
   - The latest version should have this configured correctly

4. **Check logs during deployment:**
   - Look for "Installing PHP extensions" step
   - Should see successful installation of pdo_pgsql

### Connection Errors

**Symptom:** "PostgreSQL connection failed"

**Solutions:**
- Verify `DATABASE_URL` is set correctly (no quotes, just the URL)
- Use **Internal** URL from Render PostgreSQL dashboard, not External
- Check PostgreSQL service is running in Render
- Ensure web service and PostgreSQL are in same region
- Format should be: `postgres://user:password@host:port/database`

### Schema Errors

**Symptom:** Table doesn't exist

**Solution:**
Run initialization:
```bash
php /var/www/html/init_db_universal.php
```

### Data Not Persisting

**Check:**
1. Verify DATABASE_URL is set: Visit `/src/debug.php?secret=YOUR_SECRET`
2. Should show `"type": "PostgreSQL"`
3. If showing SQLite, DATABASE_URL is not configured

## Local Development

For local development, you can still use SQLite:

```bash
# Don't set DATABASE_URL locally
# The app will automatically use SQLite

./run-docker.sh
```

The code automatically detects and uses the appropriate database.

## Free Tier Limits

Render's free PostgreSQL includes:
- ✅ 1 GB storage
- ✅ Unlimited queries
- ✅ Automatic backups
- ⚠️  Expires after 90 days (need to recreate)

For production, consider upgrading to a paid plan ($7/month).

## Backup Strategy

**Free tier:** Database expires after 90 days
- Export important data periodically
- Use Render's web console or pg_dump

**Paid tier:** Automatic backups included

## Next Steps

After setting up PostgreSQL:

1. ✅ Data persists across deployments
2. ✅ Set up GitHub Actions cron (see RENDER.md)
3. ✅ Test with `/checkpoint` and receipt uploads
4. ✅ Verify data persists after redeployment

Your bot is now production-ready! 🎉
