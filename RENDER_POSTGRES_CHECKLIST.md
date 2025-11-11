# Render PostgreSQL Setup Checklist

Use this checklist to ensure proper PostgreSQL setup on Render.

## Pre-Deployment Checklist

- [ ] Code is pushed to GitHub
- [ ] Dockerfile includes PostgreSQL extensions (verify lines with `pdo_pgsql`)
- [ ] `DATABASE_URL` environment variable support is in config.php

## PostgreSQL Database Setup

- [ ] Created PostgreSQL database in Render
- [ ] Selected **Free** tier
- [ ] Database is in **same region** as web service
- [ ] Copied **Internal Database URL** (not External)

## Web Service Configuration

- [ ] Created web service in Render
- [ ] Selected **Docker** runtime
- [ ] Added `DATABASE_URL` environment variable with Internal URL
- [ ] Added all required Discord/Gemini environment variables:
  - [ ] `DISCORD_APPLICATION_ID`
  - [ ] `DISCORD_PUBLIC_KEY`
  - [ ] `DISCORD_BOT_TOKEN`
  - [ ] `DISCORD_CHANNEL_ID`
  - [ ] `GEMINI_API_KEY`
  - [ ] `INIT_SECRET` (optional but recommended)
  - [ ] `CRON_SECRET` (optional but recommended)

## Deployment

- [ ] After adding `DATABASE_URL`, performed **"Clear build cache & deploy"**
- [ ] Deployment completed successfully
- [ ] No errors in build logs

## Verification

- [ ] Visit `https://your-service.onrender.com/check_extensions.php`
  - [ ] Shows `"pdo_pgsql_loaded": true`
  - [ ] Shows `pgsql` in `pdo_drivers` array
  
- [ ] Run initialization endpoint
  - [ ] Visit `https://your-service.onrender.com/src/init_setup.php?secret=YOUR_INIT_SECRET`
  - [ ] Shows `"database": {"status": "success"}`
  - [ ] Shows `"type": "PostgreSQL"`

- [ ] Discord commands registered
  - [ ] Shows `"commands": {"status": "success"}`

## Testing

- [ ] Discord Interactions Endpoint verified
- [ ] Can use `/start` command in Discord
- [ ] Can upload receipt images
- [ ] Messages are processed (check after 1-5 minutes)

## Troubleshooting Resources

If you encounter issues:

1. **"could not find driver"** → See POSTGRES.md, rebuild with clean cache
2. **Connection failed** → Verify DATABASE_URL format and region
3. **Commands not working** → Check Discord Developer Portal settings
4. **Images not processing** → Verify GEMINI_API_KEY and cron setup

## Quick Links

- Render Dashboard: https://dashboard.render.com
- Discord Developer Portal: https://discord.com/developers/applications
- Google AI Studio: https://aistudio.google.com/app/apikey

## Common DATABASE_URL Formats

✅ Correct (from Render PostgreSQL - Internal):
```
postgres://user:password@dpg-xxxxx-a.oregon-postgres.render.com/database_name
```

❌ Wrong (External URL - slower, may have connection limits):
```
postgres://user:password@dpg-xxxxx-a.oregon-postgres.render.com:5432/database_name?ssl=true
```

❌ Wrong (quoted):
```
"postgres://user:password@host/db"
```

Just paste the raw URL without quotes.
