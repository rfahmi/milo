// Milo - shared helpers for the Node.js rewrite
//
// This module centralises configuration, database access, Discord request
// verification and common operations. It mirrors the behaviour of the
// original PHP helpers.php as closely as possible while adopting
// idiomatic Node patterns.

require('dotenv').config();

const nacl = require('tweetnacl');
const fetch = require('node-fetch');
const sqlite3 = require('sqlite3');
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const t = require('./translations');

// Cache the database connection promise so that subsequent calls reuse
// the same connection. Both SQLite and Postgres are supported. When
// DATABASE_URL is set the bot uses Postgres; otherwise it falls back
// to SQLite stored at DB_PATH (default: data/receipts.db).
let dbConnPromise;

async function getDB() {
  if (dbConnPromise) return dbConnPromise;
  dbConnPromise = (async () => {
    const dbUrl = process.env.DATABASE_URL;
    if (dbUrl) {
      const client = new Client({ connectionString: dbUrl });
      await client.connect();
      return { type: 'postgres', client };
    }
    // SQLite fallback
    const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'receipts.db');
    const dbDir = path.dirname(dbPath);
    console.log(`Using SQLite database at: ${dbPath}`);
    
    // Ensure the containing directory exists
    try {
      // Try to create directory with explicit permissions
      if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true, mode: 0o755 });
      }
      console.log(`Database directory: ${dbDir}`);
      
      // Test write permissions
      fs.accessSync(dbDir, fs.constants.W_OK);
      console.log('✓ Database directory is writable');
      
      // Check if we can write to the db file itself (if it exists)
      if (fs.existsSync(dbPath)) {
        fs.accessSync(dbPath, fs.constants.W_OK);
        console.log('✓ Database file is writable');
      }
    } catch (err) {
      console.error(`✗ Cannot write to database directory: ${dbDir}`);
      console.error(`Error: ${err.message}`);
      console.error('\n🔧 Railway fixes:');
      console.error('  Option 1 (Recommended): Use PostgreSQL');
      console.error('    - Add PostgreSQL plugin in Railway');
      console.error('    - Railway auto-sets DATABASE_URL');
      console.error('    - Run: npm run init-db-universal');
      console.error('\n  Option 2: Fix volume permissions');
      console.error('    - Railway volume mount path must match exactly');
      console.error('    - If volume is at /data, set: DB_PATH=/data/receipts.db');
      console.error('    - Check Railway docs for volume troubleshooting');
      console.error('\n  Option 3: Use /tmp (not persistent!)');
      console.error('    - Set: DB_PATH=/tmp/receipts.db');
      console.error('    - WARNING: Data lost on restart');
      throw err;
    }
    
    const db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        console.error('SQLite connection error:', err.message);
        throw err;
      }
      console.log('✓ SQLite connection established');
    });
    // Serialise to prevent concurrent writes
    db.serialize();
    return { type: 'sqlite', db };
  })();
  return dbConnPromise;
}

function isPostgres(conn) {
  return conn.type === 'postgres';
}

/**
 * Verify the Ed25519 signature on a Discord interaction. Discord signs every
 * interaction request with your application's public key. The raw body
 * captured by Express is concatenated with the timestamp header to form
 * the message. If either header or the public key is missing the
 * verification fails.
 *
 * @param {object} req Express request
 * @returns {boolean} true if the request is authentic
 */
function verifyDiscordRequest(req) {
  const signature = req.headers['x-signature-ed25519'];
  const timestamp = req.headers['x-signature-timestamp'];
  if (!signature || !timestamp) return false;
  const publicKey = process.env.DISCORD_PUBLIC_KEY || '';
  if (!publicKey) return false;
  // Build the signed message: timestamp + raw body
  const message = Buffer.from(timestamp + (req.rawBody || ''));
  try {
    const sigBuf = Buffer.from(signature, 'hex');
    const pubBuf = Buffer.from(publicKey, 'hex');
    return nacl.sign.detached.verify(message, sigBuf, pubBuf);
  } catch (e) {
    return false;
  }
}

/**
 * Resize and compress an image buffer to reduce token costs for Gemini API.
 * Maintains aspect ratio and converts to JPEG with moderate compression.
 * 
 * @param {Buffer} buffer Original image buffer
 * @param {number} maxWidth Maximum width in pixels (default: 1024)
 * @returns {Promise<Buffer>} Compressed image buffer
 */
async function resizeImage(buffer, maxWidth = 1024) {
  try {
    const image = sharp(buffer);
    const metadata = await image.metadata();
    
    // Only resize if width exceeds maxWidth
    if (metadata.width > maxWidth) {
      return await image
        .resize(maxWidth, null, {
          fit: 'inside',
          withoutEnlargement: true
        })
        .jpeg({ quality: 80 })
        .toBuffer();
    }
    
    // If already small enough, just convert to JPEG with compression
    return await image
      .jpeg({ quality: 80 })
      .toBuffer();
  } catch (err) {
    console.error('Error resizing image:', err);
    // Return original buffer if resize fails
    return buffer;
  }
}

/**
 * Call the Gemini API to extract the total amount from a shopping receipt
 * image. The API expects the image encoded as base64 and returns a
 * natural-language response containing the total. The function cleans
 * the response and extracts the largest number it can find. It throws
 * descriptive errors when the call fails or produces unusable data.
 *
 * @param {string} imageUrl URL of the receipt image
 * @returns {Promise<number>} extracted total amount
 */
async function getTotalFromReceiptGemini(imageUrl) {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set');
  // Download the image into a Buffer
  const imgResp = await fetch(imageUrl);
  if (!imgResp.ok) {
    throw new Error(`Failed to download image: ${imageUrl}`);
  }
  const buffer = await imgResp.buffer();
  
  // Resize image to save tokens (max width 1024px)
  const resizedBuffer = await resizeImage(buffer, 1024);
  const imageBase64 = resizedBuffer.toString('base64');
  
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const payload = {
    contents: [
      {
        parts: [
          {
            text: t.gemini.receiptExtraction
          },
          {
            inline_data: {
              mime_type: 'image/jpeg',
              data: imageBase64
            }
          }
        ]
      }
    ]
  };
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Gemini API error (HTTP ${resp.status}): ${errText}`);
  }
  const json = await resp.json();
  if (json.error) {
    const errorMsg = json.error.message || 'Unknown error';
    throw new Error(`Gemini API error: ${errorMsg}`);
  }
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text || '';
  if (!text) {
    throw new Error('Empty response from Gemini');
  }
  
  // Check if Gemini says it's not a receipt
  if (text.trim().toUpperCase().includes('NOT_A_RECEIPT') || text.trim().toUpperCase() === 'NOT A RECEIPT') {
    throw new Error('Image is not a valid receipt');
  }
  
  // Remove currency symbols, dots, commas and spaces
  const clean = text.replace(/[Rp\.,\s]/gi, '');
  const match = clean.match(/(\d+)/);
  if (match) {
    const amount = parseFloat(match[1]);
    // Basic sanity check as in the PHP version
    if (amount < 100 || amount > 100000000) {
      throw new Error(`Extracted amount seems unreasonable: ${amount}. Original text: '${text}'`);
    }
    return amount;
  }
  throw new Error(`Could not parse total from Gemini response. Text: '${text}'`);
}

/**
 * Generate a sassy comment from Gemini when an image is not a valid receipt.
 * Milo the Persian cat will roast you (nicely).
 *
 * @param {string} imageUrl URL of the image
 * @returns {Promise<string>} a sassy comment about the image
 */
async function generateSassyComment(imageUrl) {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  
  if (!apiKey) {
    return t.receipts.notReceipt[Math.floor(Math.random() * t.receipts.notReceipt.length)];
  }
  
  try {
    // Download the image into a Buffer
    const imgResp = await fetch(imageUrl);
    if (!imgResp.ok) {
      return t.receipts.imageDownloadFailed();
    }
    const buffer = await imgResp.buffer();
    
    // Resize image to save tokens (max width 1024px)
    const resizedBuffer = await resizeImage(buffer, 1024);
    const imageBase64 = resizedBuffer.toString('base64');
    
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const payload = {
      contents: [
        {
          parts: [
            {
              text: t.gemini.sassyComment
            },
            {
              inline_data: {
                mime_type: 'image/jpeg',
                data: imageBase64
              }
            }
          ]
        }
      ]
    };
    
    console.log('Requesting sassy comment from Gemini...');
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    if (!resp.ok) {
      const errText = await resp.text();
      console.error('Gemini API error for sassy comment:', resp.status, errText);
      
      // Return random fallback message
      return t.receipts.notReceipt[Math.floor(Math.random() * t.receipts.notReceipt.length)];
    }
    
    const json = await resp.json();
    
    const comment = json.candidates?.[0]?.content?.parts?.[0]?.text || '';
    if (comment && comment.trim().length > 0) {
      console.log('Generated sassy comment:', comment.trim());
      return comment.trim();
    }
    
    console.log('Empty comment from Gemini, using fallback');
    return t.receipts.notReceipt[Math.floor(Math.random() * t.receipts.notReceipt.length)];
  } catch (e) {
    console.error('Failed to generate sassy comment:', e.message);
    return t.receipts.notReceipt[Math.floor(Math.random() * t.receipts.notReceipt.length)];
  }
}

// Internal helpers for running queries. These functions abstract away
// database differences between Postgres and SQLite.
async function fetchOne(conn, sql, params) {
  if (isPostgres(conn)) {
    const res = await conn.client.query(sql, params);
    return res.rows[0] || null;
  }
  return new Promise((resolve, reject) => {
    conn.db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row || null);
    });
  });
}

async function fetchAll(conn, sql, params) {
  if (isPostgres(conn)) {
    const res = await conn.client.query(sql, params);
    return res.rows;
  }
  return new Promise((resolve, reject) => {
    conn.db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

async function run(conn, sql, params) {
  if (isPostgres(conn)) {
    const res = await conn.client.query(sql, params);
    return res;
  }
  return new Promise((resolve, reject) => {
    conn.db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

// High-level database operations. Each returns or updates data in a
// database-agnostic way.

async function getActiveCheckpoint(conn, channelId) {
  const sqlPg =
    'SELECT * FROM checkpoints WHERE channel_id = $1 AND closed_at IS NULL ORDER BY id DESC LIMIT 1';
  const sqlSqlite =
    'SELECT * FROM checkpoints WHERE channel_id = ? AND closed_at IS NULL ORDER BY id DESC LIMIT 1';
  return await fetchOne(conn, isPostgres(conn) ? sqlPg : sqlSqlite, [channelId]);
}

async function createCheckpoint(conn, channelId, startMessageId) {
  const createdAt = new Date().toISOString();
  if (isPostgres(conn)) {
    const res = await conn.client.query(
      'INSERT INTO checkpoints (channel_id, created_at, start_message_id) VALUES ($1,$2,$3) RETURNING id',
      [channelId, createdAt, startMessageId]
    );
    return res.rows[0].id;
  }
  const result = await run(
    conn,
    'INSERT INTO checkpoints (channel_id, created_at, start_message_id) VALUES (?,?,?)',
    [channelId, createdAt, startMessageId]
  );
  return result.lastID;
}

async function closeCheckpoint(conn, checkpointId, endMessageId) {
  const closedAt = new Date().toISOString();
  if (isPostgres(conn)) {
    await conn.client.query('UPDATE checkpoints SET closed_at = $1, end_message_id = $2 WHERE id = $3', [closedAt, endMessageId, checkpointId]);
  } else {
    await run(conn, 'UPDATE checkpoints SET closed_at = ?, end_message_id = ? WHERE id = ?', [closedAt, endMessageId, checkpointId]);
  }
}

async function addReceipt(conn, data) {
  if (isPostgres(conn)) {
    const res = await conn.client.query(
      'INSERT INTO receipts (user_id, user_name, channel_id, checkpoint_id, message_id, image_url, amount, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (checkpoint_id, message_id, image_url) DO NOTHING RETURNING id',
      [
        data.user_id,
        data.user_name,
        data.channel_id,
        data.checkpoint_id,
        data.message_id,
        data.image_url,
        data.amount,
        data.created_at
      ]
    );
    return res.rows[0] ? res.rows[0].id : null;
  }
  const result = await run(
    conn,
    'INSERT OR IGNORE INTO receipts (user_id, user_name, channel_id, checkpoint_id, message_id, image_url, amount, created_at) VALUES (?,?,?,?,?,?,?,?)',
    [
      data.user_id,
      data.user_name,
      data.channel_id,
      data.checkpoint_id,
      data.message_id,
      data.image_url,
      data.amount,
      data.created_at
    ]
  );
  return result.lastID || null;
}

async function summarizeCheckpoint(conn, checkpointId) {
  const sqlPg =
    'SELECT user_name, user_id, SUM(amount) AS total FROM receipts WHERE checkpoint_id = $1 GROUP BY user_id, user_name ORDER BY total DESC';
  const sqlSqlite =
    'SELECT user_name, user_id, SUM(amount) AS total FROM receipts WHERE checkpoint_id = ? GROUP BY user_id, user_name ORDER BY total DESC';
  return await fetchAll(conn, isPostgres(conn) ? sqlPg : sqlSqlite, [checkpointId]);
}

async function getLatestCheckpoint(conn, channelId) {
  const sqlPg = 'SELECT * FROM checkpoints WHERE channel_id = $1 ORDER BY id DESC LIMIT 1';
  const sqlSqlite = 'SELECT * FROM checkpoints WHERE channel_id = ? ORDER BY id DESC LIMIT 1';
  return await fetchOne(conn, isPostgres(conn) ? sqlPg : sqlSqlite, [channelId]);
}

async function getReceiptsForCheckpoint(conn, checkpointId) {
  const sqlPg =
    'SELECT user_name, amount, created_at, message_id FROM receipts WHERE checkpoint_id = $1 ORDER BY created_at ASC';
  const sqlSqlite =
    'SELECT user_name, amount, created_at, message_id FROM receipts WHERE checkpoint_id = ? ORDER BY created_at ASC';
  return await fetchAll(conn, isPostgres(conn) ? sqlPg : sqlSqlite, [checkpointId]);
}

async function getChannelState(conn, channelId) {
  const sqlPg = 'SELECT * FROM channel_state WHERE channel_id = $1';
  const sqlSqlite = 'SELECT * FROM channel_state WHERE channel_id = ?';
  return await fetchOne(conn, isPostgres(conn) ? sqlPg : sqlSqlite, [channelId]);
}

async function setChannelLastMessage(conn, channelId, lastMessageId) {
  if (isPostgres(conn)) {
    await conn.client.query(
      'INSERT INTO channel_state (channel_id, last_message_id) VALUES ($1,$2) ON CONFLICT(channel_id) DO UPDATE SET last_message_id = $2',
      [channelId, lastMessageId]
    );
  } else {
    await run(
      conn,
      'INSERT INTO channel_state (channel_id, last_message_id) VALUES (?,?) ON CONFLICT(channel_id) DO UPDATE SET last_message_id = ?',
      [channelId, lastMessageId, lastMessageId]
    );
  }
}

/**
 * Process new messages from a Discord channel. This function implements
 * the same logic as PHP's cron_process_messages.php: it fetches
 * messages after the last processed ID, skips messages without
 * attachments or from bots, ignores messages when no checkpoint is
 * active, sends images to Gemini for parsing and stores receipts.
 *
 * @param {*} conn database connection
 * @param {string} channelId Discord channel ID
 * @returns {Promise<object>} result with processed count and last_message_id
 */
async function processNewMessages(conn, channelId) {
  const botToken = process.env.DISCORD_BOT_TOKEN;
  if (!botToken) {
    return { error: 'DISCORD_BOT_TOKEN is not set' };
  }
  // Determine the starting point
  const state = await getChannelState(conn, channelId);
  const after = state ? state.last_message_id : null;
  let url = `https://discord.com/api/v10/channels/${channelId}/messages?limit=50`;
  if (after) {
    url += `&after=${encodeURIComponent(after)}`;
  }
  const resp = await fetch(url, {
    headers: {
      Authorization: `Bot ${botToken}`,
      'User-Agent': 'MiloBot/1.0'
    }
  });
  if (!resp.ok) {
    return { error: 'Invalid response from Discord' };
  }
  const messages = await resp.json();
  if (!Array.isArray(messages) || messages.length === 0) {
    return { processed: 0 };
  }
  messages.reverse();
  let processed = 0;
  let lastMsgId = after;
  for (const msg of messages) {
    const msgId = msg.id;
    lastMsgId = msgId;
    await setChannelLastMessage(conn, channelId, msgId);
    // Skip if author is a bot
    if (msg.author && msg.author.bot) continue;
    const attachments = msg.attachments || [];
    if (attachments.length === 0) continue;
    // Check if a checkpoint is running
    const active = await getActiveCheckpoint(conn, channelId);
    if (!active) continue;
    for (const att of attachments) {
      const contentType = att.content_type || '';
      const imageUrl = att.url;
      if (!imageUrl) continue;
      if (contentType && !contentType.startsWith('image/')) continue;
      try {
        const amount = await getTotalFromReceiptGemini(imageUrl);
        const receiptId = await addReceipt(conn, {
          user_id: msg.author.id,
          user_name: msg.author.username,
          channel_id: channelId,
          checkpoint_id: active.id,
          message_id: msgId,
          image_url: imageUrl,
          amount: amount,
          created_at: new Date().toISOString()
        });
        if (receiptId) {
          processed++;
          // Acknowledge in channel
          const ack = t.receipts.acknowledged(active.id, receiptId, msg.author.username, amount.toLocaleString('id-ID'));
          await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
            method: 'POST',
            headers: {
              Authorization: `Bot ${botToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ content: ack })
          });
        }
      } catch (e) {
        // Image is not a valid receipt, generate a sassy comment
        console.log(`Not a receipt (${imageUrl}): ${e.message}`);
        // Generate a sassy comment when image is not a valid receipt
        const sassyComment = await generateSassyComment(imageUrl);
        try {
          await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
            method: 'POST',
            headers: {
              Authorization: `Bot ${botToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
              content: sassyComment,
              message_reference: {
                message_id: msgId
              }
            })
          });
        } catch (replyErr) {
          console.error('Failed to send sassy comment:', replyErr.message);
        }
      }
    }
  }
  return { processed, last_message_id: lastMsgId };
}

module.exports = {
  getDB,
  isPostgres,
  verifyDiscordRequest,
  resizeImage,
  getTotalFromReceiptGemini,
  generateSassyComment,
  getActiveCheckpoint,
  createCheckpoint,
  closeCheckpoint,
  addReceipt,
  summarizeCheckpoint,
  getLatestCheckpoint,
  getReceiptsForCheckpoint,
  getChannelState,
  setChannelLastMessage,
  processNewMessages,
  fetchOne,
  fetchAll,
  run
};