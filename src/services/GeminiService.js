const fetch = require('node-fetch');
const sharp = require('sharp');
const config = require('../config');
const t = require('../utils/translations');

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
        if (json.error) throw new Error(`Gemini API error: ${json.error.message}`);

        const text = json.candidates?.[0]?.content?.parts?.[0]?.text || '';
        if (!text) throw new Error('Empty response from Gemini');

        if (text.trim().toUpperCase().includes('NOT_A_RECEIPT') || text.trim().toUpperCase() === 'NOT A RECEIPT') {
            throw new Error('Image is not a valid receipt');
        }

        const clean = text.replace(/[Rp\.,\s]/gi, '');
        const match = clean.match(/(\d+)/);

        if (match) {
            const amount = parseFloat(match[1]);
            if (amount < 100 || amount > 100000000) {
                throw new Error(`Extracted amount seems unreasonable: ${amount}. Original text: '${text}'`);
            }
            return amount;
        }

        throw new Error(`Could not parse total from Gemini response. Text: '${text}'`);
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

    async analyzeText(text, history) {
        if (!this.apiKey) return { intent: 'CHAT', response: 'Gapunya API Key woy.' };

        const url = `${this.baseUrl}/${this.model}:generateContent?key=${this.apiKey}`;

        // Format history
        const context = history.map(msg => `User (${msg.author.username}): ${msg.content}`).join('\n');
        const prompt = `${t.gemini.textAnalysis}\n\nChat History:\n${context}\n\nCurrent Input: ${text}`;

        const payload = {
            contents: [{
                parts: [{ text: prompt }]
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
                    console.warn(`[GeminiService] Rate limit hit (429). Retrying in ${delay}ms... (Attempt ${retryCount + 1}/${maxRetries})`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    retryCount++;
                    delay *= 2; // Exponential backoff
                    continue;
                }

                if (!resp.ok) {
                    console.error('Gemini API error (analyzeText):', resp.status);
                    return { intent: 'CHAT', response: 'Lagi error nih otak aku.' };
                }

                const json = await resp.json();
                let rawText = json.candidates?.[0]?.content?.parts?.[0]?.text || '';

                rawText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();

                try {
                    return JSON.parse(rawText);
                } catch (e) {
                    console.error('Failed to parse JSON from Gemini:', rawText);
                    return { intent: 'CHAT', response: rawText || 'Hah?' };
                }

            } catch (e) {
                console.error('analyzeText exception:', e);
                return { intent: 'CHAT', response: 'Lagi pusing aku.' };
            }
        }

        return { intent: 'CHAT', response: 'Lagi rame banget nih, otak aku ngebul. Coba bentar lagi ya.' };
    }

    getRandomFallback() {
        return t.receipts.notReceipt[Math.floor(Math.random() * t.receipts.notReceipt.length)];
    }
}

module.exports = new GeminiService();
