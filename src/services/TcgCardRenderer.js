const sharp = require('sharp');
const fetch = require('node-fetch');

const CACHE_TTL_MS = 3 * 60 * 60 * 1000; // 3 hours
let memeCache = { items: [], fetchedAt: 0 };

const RARITY_STYLES = {
    C: {
        border1: '#94a3b8',
        border2: '#475569',
        badgeBg: '#64748b',
        badgeText: '#f8fafc',
        accent: '#cbd5e1'
    },
    B: {
        border1: '#34d399',
        border2: '#059669',
        badgeBg: '#10b981',
        badgeText: '#0f172a',
        accent: '#6ee7b7'
    },
    A: {
        border1: '#38bdf8',
        border2: '#0284c7',
        badgeBg: '#0ea5e9',
        badgeText: '#0f172a',
        accent: '#7dd3fc'
    },
    S: {
        border1: '#c084fc',
        border2: '#7e22ce',
        badgeBg: '#a855f7',
        badgeText: '#f8fafc',
        accent: '#e9d5ff'
    },
    SS: {
        border1: '#facc15',
        border2: '#b45309',
        badgeBg: '#f59e0b',
        badgeText: '#0f172a',
        accent: '#fde047'
    }
};

function escapeXml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

function wrapText(text, maxLen = 40) {
    const words = String(text || '').split(/\s+/);
    const lines = [];
    let current = '';
    for (const w of words) {
        const candidate = current ? `${current} ${w}` : w;
        if (candidate.length > maxLen) {
            if (current) lines.push(current);
            current = w;
        } else {
            current = candidate;
        }
    }
    if (current) lines.push(current);
    return lines.slice(0, 2);
}

class TcgCardRenderer {
    async fetchRandomCatMeme(rarity = 'C', excludedUrls = new Set(), tag = 'cute') {
        const now = Date.now();
        if (memeCache.items.length === 0 || (now - memeCache.fetchedAt) > CACHE_TTL_MS) {
            const collected = [];
            const seen = new Set();
            for (const sub of ['Catmemes', 'MEOW_IRL']) {
                try {
                    const resp = await fetch(`https://www.reddit.com/r/${sub}/top.json?t=month&limit=50`, {
                        headers: { 'User-Agent': 'MiloDiscordBot/1.0' },
                        timeout: 5000
                    });
                    if (!resp.ok) continue;
                    const json = await resp.json();
                    const posts = json?.data?.children || [];
                    for (const p of posts) {
                        const d = p.data;
                        if (!d || d.over_18 || !d.url || seen.has(d.url)) continue;
                        if (/\.(jpg|jpeg|png)$/i.test(d.url)) {
                            seen.add(d.url);
                            collected.push({ url: d.url, title: d.title, score: d.score || 0 });
                        }
                    }
                } catch (e) {
                    console.warn(`[TcgCardRenderer] Reddit fetch failed for r/${sub}:`, e.message);
                }
            }
            if (collected.length > 0) {
                // Sort descending by upvotes so higher rarities get the most popular memes
                collected.sort((a, b) => b.score - a.score);
                memeCache = { items: collected, fetchedAt: now };
            }
        }

        if (memeCache.items.length > 0) {
            const total = memeCache.items.length;
            const b1 = Math.max(1, Math.floor(total * 0.05));           // SS: top 5%
            const b2 = Math.max(b1 + 1, Math.floor(total * 0.20));      // S: next 15%
            const b3 = Math.max(b2 + 1, Math.floor(total * 0.45));      // A: next 25%
            const b4 = Math.max(b3 + 1, Math.floor(total * 0.75));      // B: next 30%

            const ranges = {
                SS: [0, b1],
                S: [b1, b2],
                A: [b2, b3],
                B: [b3, b4],
                C: [b4, total]
            };
            const [start, end] = ranges[rarity] || ranges.C;
            const bucket = memeCache.items
                .slice(start, end)
                .filter(item => !excludedUrls.has(item.url));

            if (bucket.length > 0) {
                const pick = bucket[Math.floor(Math.random() * bucket.length)];
                return { ...pick, fromReddit: true };
            }
        }

        const safeTag = encodeURIComponent(tag || 'cute');
        const cataasJsonUrls = [
            `https://cataas.com/cat/${safeTag}?json=true`,
            'https://cataas.com/cat?json=true'
        ];
        for (const jsonUrl of cataasJsonUrls) {
            try {
                const resp = await fetch(jsonUrl, {
                    headers: { 'User-Agent': 'MiloDiscordBot/1.0' },
                    timeout: 8000
                });
                if (!resp.ok) continue;
                const data = await resp.json();
                const catId = data?._id || data?.id;
                if (catId) {
                    return {
                        url: `https://cataas.com/cat/${catId}?width=420`,
                        title: 'Random Cat',
                        fromReddit: false
                    };
                }
            } catch (e) {
                console.warn(`[TcgCardRenderer] cataas json lookup failed (${jsonUrl}):`, e.message);
            }
        }

        return {
            url: `https://cataas.com/cat/${safeTag}?width=420&rarity=${encodeURIComponent(rarity)}&t=${Date.now()}`,
            title: 'Random Cat',
            fromReddit: false
        };
    }

    async downloadArtBuffer(imageUrl) {
        const targets = [imageUrl, `https://cataas.com/cat?width=420&t=${Date.now()}`];
        for (const url of targets) {
            try {
                const resp = await fetch(url, {
                    headers: { 'User-Agent': 'MiloDiscordBot/1.0' },
                    timeout: 12000
                });
                if (!resp.ok) continue;
                const buf = await resp.buffer();
                return await sharp(buf)
                    .resize(372, 270, { fit: 'cover', position: 'centre' })
                    .png()
                    .toBuffer();
            } catch (e) {
                console.warn(`[TcgCardRenderer] Art download failed (${url}):`, e.message);
            }
        }
        return null;
    }

    async renderCardPng(card) {
        const style = RARITY_STYLES[card.rarity] || RARITY_STYLES.C;
        const skillLines = wrapText(card.skill_desc, 36);
        const title = escapeXml(String(card.name).slice(0, 24));
        const rarityLabel = escapeXml(card.rarity);
        const cardNum = String(card.user_card_id || card.id || 1).padStart(3, '0');

        const svg = `
<svg width="420" height="600" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="borderGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${style.border1}"/>
      <stop offset="100%" stop-color="${style.border2}"/>
    </linearGradient>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#1e1b4b"/>
      <stop offset="100%" stop-color="#0f172a"/>
    </linearGradient>
  </defs>

  <rect x="0" y="0" width="420" height="600" rx="22" fill="url(#borderGrad)"/>
  <rect x="10" y="10" width="400" height="580" rx="16" fill="url(#bgGrad)"/>

  <rect x="24" y="24" width="372" height="44" rx="10" fill="#1e293b" stroke="${style.border1}" stroke-width="2"/>
  <text x="38" y="52" font-family="DejaVu Sans, Arial, sans-serif" font-size="19" font-weight="bold" fill="#f8fafc">${title}</text>
  <rect x="328" y="32" width="56" height="28" rx="6" fill="${style.badgeBg}"/>
  <text x="356" y="52" font-family="DejaVu Sans, Arial, sans-serif" font-size="15" font-weight="bold" fill="${style.badgeText}" text-anchor="middle">${rarityLabel}</text>

  <rect x="24" y="80" width="372" height="270" rx="12" fill="#0f172a" stroke="${style.border1}" stroke-width="3"/>

  <text x="28" y="376" font-family="DejaVu Sans, Arial, sans-serif" font-size="13" font-weight="bold" fill="${style.accent}">CAT MEME  •  #${cardNum}</text>
  <text x="392" y="376" font-family="DejaVu Sans, Arial, sans-serif" font-size="13" fill="#94a3b8" text-anchor="end">Recycle: ${card.recycle_value} tuna</text>

  <rect x="24" y="390" width="372" height="122" rx="10" fill="#1e293b" stroke="#334155" stroke-width="1.5"/>
  <text x="38" y="418" font-family="DejaVu Sans, Arial, sans-serif" font-size="15" font-weight="bold" fill="#f8fafc">Skill: ${escapeXml(card.skill_name)}</text>
  <text x="38" y="444" font-family="DejaVu Sans, Arial, sans-serif" font-size="13" fill="#cbd5e1">${escapeXml(skillLines[0] || '')}</text>
  <text x="38" y="464" font-family="DejaVu Sans, Arial, sans-serif" font-size="13" fill="#cbd5e1">${escapeXml(skillLines[1] || '')}</text>
  <line x1="38" y1="482" x2="382" y2="482" stroke="#334155" stroke-width="1"/>
  <text x="38" y="502" font-family="DejaVu Sans, Arial, sans-serif" font-size="12" font-style="italic" fill="#94a3b8">"${escapeXml(card.flavor_text)}"</text>

  <rect x="24" y="526" width="178" height="46" rx="10" fill="#1e293b" stroke="${style.border1}" stroke-width="1.5"/>
  <text x="113" y="555" font-family="DejaVu Sans, Arial, sans-serif" font-size="17" font-weight="bold" fill="${style.accent}" text-anchor="middle">ATK  ${card.atk}</text>

  <rect x="218" y="526" width="178" height="46" rx="10" fill="#1e293b" stroke="#38bdf8" stroke-width="1.5"/>
  <text x="307" y="555" font-family="DejaVu Sans, Arial, sans-serif" font-size="17" font-weight="bold" fill="#7dd3fc" text-anchor="middle">SLEEP  ${card.sleep}</text>
</svg>`;

        const artBuffer = await this.downloadArtBuffer(card.image_url);
        const base = sharp(Buffer.from(svg));
        if (artBuffer) {
            return await base
                .composite([{ input: artBuffer, left: 24, top: 80 }])
                .jpeg({ quality: 92 })
                .toBuffer();
        }
        return await base.jpeg({ quality: 92 }).toBuffer();
    }
}

module.exports = new TcgCardRenderer();
