# Quick Fix for "could not find driver" Error on Render

## The Problem
You're getting this error when using Render's PostgreSQL free tier:
```json
{
  "database": {
    "status": "error",
    "message": "PostgreSQL connection failed: could not find driver"
  }
}
```

## The Solution

### Step 1: Ensure Your Code is Updated
Make sure you have the latest code with PostgreSQL support. The Dockerfile should include:
```dockerfile
RUN docker-php-ext-install pdo pdo_sqlite pgsql pdo_pgsql
```

### Step 2: Setup Render PostgreSQL Database

1. **Create PostgreSQL database:**
   - Go to https://dashboard.render.com
   - Click **"New +"** → **"PostgreSQL"**
   - Name: `milo-db`
   - Plan: **Free**
   - Click **"Create Database"**

2. **Get connection string:**
   - In the database page, go to **"Connections"**
   - Copy the **"Internal Database URL"**
   - Should look like: `postgres://user:pass@dpg-xxxxx.render.com/dbname`

### Step 3: Configure Web Service

1. **Add DATABASE_URL:**
   - Go to your web service in Render
   - Click **"Environment"**
   - Add new variable:
     - Key: `DATABASE_URL`
     - Value: (paste the Internal URL from step 2)
   - Click **"Save Changes"**

2. **IMPORTANT - Clear cache and rebuild:**
   - Click **"Manual Deploy"**
   - Select **"Clear build cache & deploy"**
   - Wait for deployment to complete (~3-5 minutes)

### Step 4: Verify Installation

1. **Check extensions are loaded:**
   ```
   https://your-service.onrender.com/check_extensions.php
   ```
   
   Should show:
   ```json
   {
     "pdo_pgsql_loaded": true,
     "pdo_drivers": ["mysql", "pgsql", "sqlite"]
   }
   ```

2. **Initialize database:**
   ```
   https://your-service.onrender.com/src/init_setup.php?secret=YOUR_INIT_SECRET
   ```
   
   Should show:
   ```json
   {
     "database": {
       "status": "success",
       "type": "PostgreSQL"
     }
   }
   ```

### Step 5: Test

In Discord:
- Use `/start` command
- Upload a receipt
- Wait 1-5 minutes for processing
- Use `/end` to see results

## Why This Happens

The error occurs because:
1. The PostgreSQL PDO extension wasn't installed in the Docker image
2. The Docker image was cached and not rebuilt
3. The `DATABASE_URL` was set but the extension wasn't available

## What We Fixed

1. ✅ Updated Dockerfile to properly install `pdo_pgsql`
2. ✅ Added verification step to ensure extension loads
3. ✅ Added diagnostic endpoint to check installation
4. ✅ Improved error messages to show what's available

## Still Having Issues?

1. **Check deployment logs:**
   - Go to Render → Your Service → Logs
   - Look for "Installing PHP extensions"
   - Should see successful installation

2. **Verify region:**
   - PostgreSQL database and web service should be in same region
   - Edit in Render dashboard if needed

3. **Check DATABASE_URL format:**
   - Must start with `postgres://`
   - No quotes around the URL
   - Use Internal URL, not External

4. **Review full checklist:**
   - See `RENDER_POSTGRES_CHECKLIST.md` for complete steps

## Reference

- Full Render guide: `RENDER.md`
- PostgreSQL setup: `POSTGRES.md`
- Checklist: `RENDER_POSTGRES_CHECKLIST.md`
