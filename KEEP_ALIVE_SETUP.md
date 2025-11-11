# GitHub Actions Keep-Alive Setup

This project includes a GitHub Actions workflow that pings your Render service every 5 minutes between 07:00-22:00 WIB to prevent it from sleeping on the free tier.

## Setup Instructions

### 1. Add GitHub Secret

1. Go to your GitHub repository
2. Navigate to **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Add the following secret:
   - **Name**: `SERVICE_URL`
   - **Value**: Your Render service URL (e.g., `https://your-service.onrender.com`)

### 2. Push the Workflow

The workflow file is located at `.github/workflows/keep-alive.yml`. Once you push it to GitHub, it will automatically:

- Run every 5 minutes between 00:00-14:59 UTC (07:00-21:59 WIB)
- Ping your service to keep it awake
- Prevent the 15-minute inactivity timeout on Render free tier

### 3. Verify It's Working

1. Go to your GitHub repository
2. Click on the **Actions** tab
3. You should see "Keep Service Alive" workflow runs
4. Check the logs to confirm successful pings

### 4. Manual Trigger (Optional)

You can manually trigger the workflow:
1. Go to **Actions** tab
2. Select **Keep Service Alive** workflow
3. Click **Run workflow**

## How It Works

- **Schedule**: Runs every 5 minutes during active hours (07:00-22:00 WIB)
- **Mechanism**: Makes HTTP GET requests to your service
- **Endpoints Pinged**:
  - `/` - Main endpoint (should return 200 or 404)
  - `/health` - Health check endpoint (returns service status)

## Time Zone Notes

- The cron schedule uses UTC time
- WIB (Western Indonesian Time) = UTC+7
- 07:00 WIB = 00:00 UTC
- 22:00 WIB = 15:00 UTC

Current schedule: `*/5 0-14 * * *` (every 5 min, 00:00-14:59 UTC)

## Cost Considerations

- GitHub Actions free tier: 2,000 minutes/month
- This workflow uses ~12 runs/hour × 15 hours/day = 180 runs/day
- Each run takes ~30 seconds = 90 minutes/day
- Monthly usage: ~2,700 minutes/month

**⚠️ This exceeds the free tier!** Consider:
- Reducing frequency to every 10-14 minutes
- Shortening active hours
- Using a free external service like UptimeRobot instead

## Alternative: UptimeRobot

For a free alternative without GitHub Actions costs:

1. Sign up at [uptimerobot.com](https://uptimerobot.com)
2. Create a new HTTP monitor
3. Set URL to your Render service
4. Set interval to 5 minutes
5. This gives you 50 monitors for free (more than enough)

## Reducing GitHub Actions Cost

Edit `.github/workflows/keep-alive.yml`:

```yaml
# Every 10 minutes instead of 5 (saves 50% cost)
- cron: '*/10 0-14 * * *'

# Or every 14 minutes (just under the 15-min timeout)
- cron: '*/14 0-14 * * *'
```

## Monitoring

The workflow will:
- ✅ Show success if service responds with 200 or 404
- ❌ Fail if service is unreachable (helps you detect downtime)
- Check the Actions tab for run history
