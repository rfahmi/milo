# Troubleshooting: Attachments Not Found

## Problem

Cron shows messages processed but 0 attachments found:
```json
{
  "processed": 2,
  "receipts_added": 0,
  "debug": [
    "Message xxx: 0 attachments found"
  ]
}
```

## Root Cause

Discord bot is missing required **Privileged Gateway Intents**, specifically:
- **MESSAGE CONTENT INTENT**

Without this, Discord doesn't send attachment data in the messages API response.

## Solution

### 1. Enable MESSAGE CONTENT Intent in Discord Developer Portal

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Select your application
3. Click **"Bot"** in the left sidebar
4. Scroll down to **"Privileged Gateway Intents"**
5. Enable these toggles:
   - ✅ **PRESENCE INTENT** (optional)
   - ✅ **SERVER MEMBERS INTENT** (optional)
   - ✅ **MESSAGE CONTENT INTENT** ⚠️ **REQUIRED**
6. Click **"Save Changes"**

### 2. Re-invite the Bot (if already in server)

The bot needs to be re-invited with the new permissions:

1. Go to **"OAuth2"** → **"URL Generator"**
2. Select scopes:
   - ✅ `bot`
   - ✅ `applications.commands`
3. Select bot permissions:
   - ✅ `Read Messages/View Channels`
   - ✅ `Send Messages`
   - ✅ `Read Message History`
4. Copy the generated URL
5. Open the URL and **re-invite** the bot to your server
   - If already in server, Discord will update permissions

### 3. Verify the Fix

After enabling MESSAGE CONTENT intent:

1. Upload a test receipt image in your Discord channel
2. Trigger the cron:
   ```
   https://your-service.onrender.com/src/trigger_cron.php?secret=YOUR_SECRET
   ```
3. Check the debug output - should now show:
   ```json
   {
     "debug": [
       "Message xxx: 1 attachments found",
       "  - Attachment type: image/png",
       "    Processing image for user: username",
       "    Gemini extracted amount: 125000",
       "    Receipt saved successfully!"
     ]
   }
   ```

## Alternative: Check Raw Discord API Response

Use the test endpoint to see what Discord is actually returning:

```
https://your-service.onrender.com/src/test_discord_api.php?secret=YOUR_SECRET
```

This shows the raw message data. Look for `attachments` array - should contain image data.

## Why This Happens

Discord has different tiers of data access:

**Without MESSAGE CONTENT intent:**
- Can see message metadata (ID, author, timestamp)
- ❌ Cannot see message content or attachments

**With MESSAGE CONTENT intent:**
- Can see everything including attachments
- ✅ Required for bots that process images/files

## Verification Checklist

After enabling MESSAGE CONTENT intent:

- [ ] Intent enabled in Discord Developer Portal
- [ ] Bot re-invited to server (or permissions updated)
- [ ] Test image uploaded in channel
- [ ] Cron shows "X attachments found" (X > 0)
- [ ] Gemini processes the image
- [ ] Receipt added to database

## Still Not Working?

### Check bot permissions in Discord:

1. Right-click the bot in your server member list
2. Check it has these permissions in the channel:
   - ✅ View Channel
   - ✅ Read Message History

### Check environment variables:

```
https://your-service.onrender.com/src/debug.php?secret=YOUR_SECRET
```

Verify:
- `DISCORD_BOT_TOKEN` is set
- `DISCORD_CHANNEL_ID` is correct
- Database is connected

### Test with fresh messages:

1. Run `/checkpoint` to start a new checkpoint
2. Upload a NEW image (after checkpoint started)
3. Wait for cron to run
4. Check if it's detected

The bot only processes messages **after** the last processed message ID. Old messages won't be reprocessed.

## Common Mistakes

❌ Forgot to enable MESSAGE CONTENT intent
❌ Didn't re-invite bot after enabling intent
❌ Bot doesn't have Read Message History permission
❌ Testing with old messages (already processed)
❌ Wrong DISCORD_CHANNEL_ID

## Next Steps

After fixing:

1. ✅ Enable MESSAGE CONTENT intent
2. ✅ Re-invite bot
3. ✅ Start fresh checkpoint: `/checkpoint`
4. ✅ Upload test receipt
5. ✅ Trigger cron manually
6. ✅ Verify receipt is saved
7. ✅ Close checkpoint: `/checkpoint`
8. ✅ See summary with totals!

Your bot should now work perfectly! 🎉
