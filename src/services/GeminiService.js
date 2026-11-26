const fetch = require('node-fetch');
const sharp = require('sharp');
const config = require('../config');
const t = require('../utils/translations');
const memoryRepo = require('../data/repositories/MemoryRepository');
const db = require('../data/db');

class GeminiService {
    constructor() {
        this.apiKey = config.gemini.apiKey;
        this.model = config.gemini.model;
        this.baseUrl = 'https://generativelanguage.googleapis.com/v1beta/models';
    }

    async resizeImage(buffer, maxWidth = 1024) {
        try {
            const image = sharp(buffer);
            const metadata = await image.metadata();

            if (metadata.width > maxWidth) {
                return await image
                    .resize(maxWidth, null, {
                        fit: 'inside',
                        withoutEnlargement: true
                    })
                    .jpeg({ quality: 80 })
                    .toBuffer();
            }

            return await image
                .jpeg({ quality: 80 })
                .toBuffer();
        } catch (err) {
            console.error('Error resizing image:', err);
            return buffer;
        }
    }

    async extractTotal(imageUrl) {
        if (!this.apiKey) throw new Error('GEMINI_API_KEY is not set');

        const imgResp = await fetch(imageUrl);
        if (!imgResp.ok) throw new Error(`Failed to download image: ${imageUrl}`);

        const buffer = await imgResp.buffer();
        const resizedBuffer = await this.resizeImage(buffer);
        const imageBase64 = resizedBuffer.toString('base64');

        const url = `${this.baseUrl}/${this.model}:generateContent?key=${this.apiKey}`;
        const payload = {
            contents: [{
                parts: [
                    { text: t.gemini.receiptExtraction },
                    { inline_data: { mime_type: 'image/jpeg', data: imageBase64 } }
                ]
            }]
        };

        const maxRetries = 3;
        let retryCount = 0;
        let delay = 2000; // Start with 2 seconds

        while (retryCount <= maxRetries) {
            try {
                const resp = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (resp.status === 429 || resp.status === '429') {
                    console.warn(`[GeminiService] Rate limit hit (429) on extractTotal. Retrying in ${delay}ms... (Attempt ${retryCount + 1}/${maxRetries})`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    retryCount++;
                    delay *= 2; // Exponential backoff
                    continue;
                }

                if (!resp.ok) {
                    const errText = await resp.text();
                    throw new Error(`Gemini API error (HTTP ${resp.status}): ${errText}`);
                }

                const json = await resp.json();
                if (json.error) throw new Error(`Gemini API error: ${json.error.message}`);

                const text = json.candidates?.[0]?.content?.parts?.[0]?.text || '';
                if (!text) throw new Error('Empty response from Gemini');

                if (text.trim().toUpperCase().includes('NOT_A_RECEIPT') || text.trim().toUpperCase() === 'NOT A RECEIPT') {
                    throw new Error('Image is not a valid receipt');
                }

                let amount = null;
                let description = null;
                const jsonText = text.replace(/```json/gi, '').replace(/```/g, '').trim();

                try {
                    const parsed = JSON.parse(jsonText);
                    if (parsed && parsed.is_receipt === false) {
                        throw new Error('Image is not a valid receipt');
                    }
                    if (parsed && parsed.amount !== undefined && parsed.amount !== null) {
                        amount = typeof parsed.amount === 'number'
                            ? Math.round(parsed.amount)
                            : this.parseAmount(String(parsed.amount));
                        description = typeof parsed.merchant === 'string' && parsed.merchant.trim()
                            ? parsed.merchant.trim()
                            : null;
                    }
                } catch (parseErr) {
                    if (parseErr.message === 'Image is not a valid receipt') throw parseErr;
                    // Fallback to plain-text amount parsing if Gemini didn't return JSON
                    amount = this.parseAmount(text);
                }

                if (amount !== null) {
                    if (amount < 100 || amount > 100000000) {
                        throw new Error(`Extracted amount seems unreasonable: ${amount}. Original text: '${text}'`);
                    }
                    return { amount, description };
                }

                throw new Error(`Could not parse total from Gemini response. Text: '${text}'`);

            } catch (e) {
                // If it's not a rate limit error, throw immediately
                if (retryCount >= maxRetries || !e.message.includes('429')) {
                    throw e;
                }
            }
        }

        throw new Error('Rate limit exceeded after multiple retries');
    }

    async generateSassyComment(imageUrl) {
        if (!this.apiKey) {
            return this.getRandomFallback();
        }

        try {
            const imgResp = await fetch(imageUrl);
            if (!imgResp.ok) return t.receipts.imageDownloadFailed();

            const buffer = await imgResp.buffer();
            const resizedBuffer = await this.resizeImage(buffer);
            const imageBase64 = resizedBuffer.toString('base64');

            const url = `${this.baseUrl}/${this.model}:generateContent?key=${this.apiKey}`;
            const payload = {
                contents: [{
                    parts: [
                        { text: t.gemini.sassyComment },
                        { inline_data: { mime_type: 'image/jpeg', data: imageBase64 } }
                    ]
                }]
            };

            const resp = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!resp.ok) {
                console.error('Gemini API error for sassy comment:', resp.status);
                return this.getRandomFallback();
            }

            const json = await resp.json();
            const comment = json.candidates?.[0]?.content?.parts?.[0]?.text || '';

            if (comment && comment.trim().length > 0) {
                return comment.trim();
            }

            return this.getRandomFallback();
        } catch (e) {
            console.error('Failed to generate sassy comment:', e.message);
            return this.getRandomFallback();
        }
    }

    async analyzeText(text, history, meta = {}) {
        if (!this.apiKey) return { intent: 'CHAT', response: 'API key kosong.' };

        const url = `${this.baseUrl}/${this.model}:generateContent?key=${this.apiKey}`;

        // Format history including Milo's own previous messages for conversational memory
        const context = history.map(msg => {
            if (meta.botId && msg.author.id === meta.botId) {
                return `Milo (you): ${msg.content}`;
            }
            const name = msg.member?.displayName || msg.author.globalName || msg.author.username;
            return `${name}: ${msg.content}`;
        }).join('\n');

        const authorName = meta.authorName || 'User';
        const contextFlags = [
            `Sender: ${authorName}`,
            `Mentioned Milo: ${meta.isMentioningMilo ? 'YES' : 'NO'}`,
            `Replied directly to Milo: ${meta.isReplyToMilo ? 'YES' : 'NO'}`,
            `Addressed Milo by name: ${meta.addressedByName ? 'YES' : 'NO'}`,
            meta.replyTarget ? `Replying to message -> ${meta.replyTarget}` : null
        ].filter(Boolean).join('\n');

        let memoryBlock = '(none)';
        try {
            const memories = await memoryRepo.getRecentMemories(40);
            memoryBlock = memoryRepo.formatForPrompt(memories);
        } catch (e) {
            console.warn('[GeminiService] Could not load memories:', e.message);
        }

        const prompt = `${t.gemini.textAnalysis}\n\nSaved Memories & Rules:\n${memoryBlock}\n\nChat History:\n${context || '(empty)'}\n\nCurrent Message Context:\n${contextFlags}\nCurrent Input: ${text}`;

        const payload = {
            contents: [{
                parts: [{ text: prompt }]
            }]
        };

        const maxRetries = 3;
        let retryCount = 0;
        let delay = 2000; // Start with 2 seconds

        const isExplicitlyAddressed = Boolean(meta.isMentioningMilo || meta.isReplyToMilo || meta.addressedByName);
        const failReply = (msg) => isExplicitlyAddressed
            ? { intent: 'CHAT', response: msg }
            : { intent: 'IGNORE', response: null };

        while (retryCount <= maxRetries) {
            try {
                const resp = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (resp.status === 429 || resp.status === '429') {
                    console.warn(`[GeminiService] Rate limit hit (429). Retrying in ${delay}ms... (Attempt ${retryCount + 1}/${maxRetries})`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    retryCount++;
                    delay *= 2; // Exponential backoff
                    continue;
                }

                if (!resp.ok) {
                    console.error('Gemini API error (analyzeText):', resp.status);
                    return failReply('Otak error.');
                }

                const json = await resp.json();
                let rawText = json.candidates?.[0]?.content?.parts?.[0]?.text || '';

                rawText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();

                try {
                    return JSON.parse(rawText);
                } catch (e) {
                    console.error('Failed to parse JSON from Gemini:', rawText);
                    return isExplicitlyAddressed
                        ? { intent: 'CHAT', response: rawText || 'Hah.' }
                        : { intent: 'IGNORE', response: null };
                }

            } catch (e) {
                console.error('analyzeText exception:', e);
                return failReply('Pusing.');
            }
        }

        return failReply('Rame. Otak ngebul. Bentar.');
    }

    async searchWeb(query) {
        if (!this.apiKey) return 'API key kosong.';

        const url = `${this.baseUrl}/${this.model}:generateContent?key=${this.apiKey}`;
        const payload = {
            contents: [{
                parts: [{ text: `${t.gemini.webSearch}\n\nPertanyaan/Istilah: ${query}` }]
            }],
            tools: [{ google_search: {} }]
        };

        const maxRetries = 2;
        let retryCount = 0;
        let delay = 2000;

        while (retryCount <= maxRetries) {
            try {
                const resp = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (resp.status === 429 || resp.status === '429') {
                    await new Promise(resolve => setTimeout(resolve, delay));
                    retryCount++;
                    delay *= 2;
                    continue;
                }

                if (!resp.ok) {
                    console.error('Gemini API error (searchWeb):', resp.status);
                    return 'Gagal cari. Internet error.';
                }

                const json = await resp.json();
                const answer = json.candidates?.[0]?.content?.parts
                    ?.map(p => p.text)
                    .filter(Boolean)
                    .join('')
                    .trim();

                return answer || 'Gak ketemu.';
            } catch (e) {
                console.error('searchWeb exception:', e);
                return 'Pusing. Gagal cari.';
            }
        }

        return 'Rame. Coba bentar lagi.';
    }

    async queryDatabaseWithNL(question) {
        if (!this.apiKey) return 'API key kosong.';

        const url = `${this.baseUrl}/${this.model}:generateContent?key=${this.apiKey}`;

        try {
            // 1. Generate read-only SELECT SQL
            const sqlResp = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: `${t.gemini.dbTextToSql}\n\nQuestion: ${question}` }] }]
                })
            });
            if (!sqlResp.ok) return 'Otak error pas bikin query.';
            const sqlJson = await sqlResp.json();
            let sql = (sqlJson.candidates?.[0]?.content?.parts?.[0]?.text || '')
                .replace(/```sql/gi, '')
                .replace(/```/g, '')
                .trim();

            if (!sql) return 'Gak bisa bikin query-nya.';

            // 2. Execute via read-only SQLite connection
            let rows;
            try {
                rows = await db.allReadOnly(sql);
            } catch (dbErr) {
                console.warn('[GeminiService] Blocked/failed NL SQL:', sql, dbErr.message);
                return 'Query ditolak atau error.';
            }

            // 3. Summarize result in Milo's caveman-cat voice
            const ansResp = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{
                        parts: [{
                            text: `${t.gemini.dbAnswer}\n\nQuestion: ${question}\nSQL: ${sql}\nResult Rows (JSON): ${JSON.stringify(rows.slice(0, 50))}`
                        }]
                    }]
                })
            });
            if (!ansResp.ok) return 'Otak error pas baca hasil.';
            const ansJson = await ansResp.json();
            const answer = (ansJson.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
            return answer || 'Kosong.';
        } catch (e) {
            console.error('queryDatabaseWithNL exception:', e);
            return 'Pusing. Gagal cek DB.';
        }
    }

    async healthCheck() {
        if (!this.apiKey) return { status: 'CONFIG_ERROR', message: 'API Key missing' };

        const start = Date.now();
        const url = `${this.baseUrl}/${this.model}:generateContent?key=${this.apiKey}`;
        const payload = {
            contents: [{ parts: [{ text: "ping" }] }]
        };

        try {
            const resp = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const latency = Date.now() - start;

            if (resp.status === 429 || resp.status === '429') {
                return { status: 'RATE_LIMITED', latency, message: '429 Too Many Requests' };
            }

            if (!resp.ok) {
                return { status: 'DOWN', latency, message: `HTTP ${resp.status}` };
            }

            return { status: 'UP', latency, message: 'OK' };

        } catch (e) {
            return { status: 'ERROR', latency: Date.now() - start, message: e.message };
        }
    }

    /**
     * Parse a monetary amount string while respecting regional thousands/decimal delimiters
     * (e.g. "148,000.00" or "148.000,00" -> 148000).
     */
    parseAmount(text) {
        const cleaned = text.replace(/(?:IDR|Rp)/gi, '').replace(/[.,]-/g, '').trim();
        const match = cleaned.match(/(\d[\d.,]*)/);
        if (!match) return null;

        let numStr = match[1];
        const hasDot = numStr.includes('.');
        const hasComma = numStr.includes(',');

        if (hasDot && hasComma) {
            // Whichever separator appears last is the decimal separator.
            const decimalSep = numStr.lastIndexOf('.') > numStr.lastIndexOf(',') ? '.' : ',';
            const thousandSep = decimalSep === '.' ? ',' : '.';
            numStr = numStr.split(thousandSep).join('').replace(decimalSep, '.');
        } else if (hasDot || hasComma) {
            const sep = hasDot ? '.' : ',';
            const parts = numStr.split(sep);
            // Single separator with 1-2 trailing digits is a decimal (e.g. "148000.00");
            // multiple separators or 3 trailing digits are thousands separators (e.g. "148.000").
            if (parts.length === 2 && parts[1].length <= 2) {
                numStr = `${parts[0]}.${parts[1]}`;
            } else {
                numStr = parts.join('');
            }
        }

        const parsed = parseFloat(numStr);
        return Number.isFinite(parsed) ? Math.round(parsed) : null;
    }

    getRandomFallback() {
        return t.receipts.notReceipt[Math.floor(Math.random() * t.receipts.notReceipt.length)];
    }
}

module.exports = new GeminiService();
