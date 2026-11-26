const { AttachmentBuilder } = require('discord.js');
const tcgRepo = require('../data/repositories/TcgRepository');
const cardRenderer = require('./TcgCardRenderer');
const geminiService = require('./GeminiService');

const GACHA_COST = 10;
const CHAT_TUNA_REWARD = 1;
const CHAT_COOLDOWN_MS = 60 * 1000;
const PITY_LIMIT = 20;

const RARITY_TABLE = [
    { rarity: 'SS', weight: 2, atkMin: 88, atkMax: 100, sleepMin: 88, sleepMax: 100, recycle: 40 },
    { rarity: 'S', weight: 6, atkMin: 70, atkMax: 90, sleepMin: 70, sleepMax: 92, recycle: 20 },
    { rarity: 'A', weight: 14, atkMin: 50, atkMax: 75, sleepMin: 50, sleepMax: 78, recycle: 10 },
    { rarity: 'B', weight: 28, atkMin: 30, atkMax: 55, sleepMin: 30, sleepMax: 60, recycle: 5 },
    { rarity: 'C', weight: 50, atkMin: 10, atkMax: 35, sleepMin: 15, sleepMax: 45, recycle: 2 }
];

const CARD_TEMPLATES = {
    SS: [
        { name: 'Milo Raja Tidur', tag: 'sleepy', skill: 'Tidur Abadi', desc: 'Cuek maksimal. Bangun cuma pas denger kaleng tuna.', flavor: 'Tidur. Jangan ganggu.' },
        { name: 'Tutu Bayangan', tag: 'black', skill: 'Mode Ninja Hitam', desc: 'Hilang di ruangan gelap. Cuma kelihatan mata kuning.', flavor: 'Gelap. Gak kelihatan.' },
        { name: 'Kaisar Kucing Oren', tag: 'orange', skill: 'Otak Satu Sel', desc: 'Bikin rusuh satu rumah tapi tetep disayang.', flavor: 'Rusuh. Bodo amat.' },
        { name: 'Milo Sultan Tuna', tag: 'persian', skill: 'Makan Mewah', desc: 'Nolak dry food murah. Maunya tuna kaleng.', flavor: 'Murah. Gak mau.' }
    ],
    S: [
        { name: 'Kuki Ragdoll', tag: 'fluffy', skill: 'Tatapan Polos', desc: 'Duduk manis di depan mangkok kosong sampai dikasih makan.', flavor: 'Lapar. Mangkok kosong.' },
        { name: 'Milo Tabby Bos', tag: 'tabby', skill: 'Audit Struk', desc: 'Lirik struk belanjaan sambil nge-judge pengeluaran.', flavor: 'Boros. Kurangin jajan.' },
        { name: 'Kucing Bos Mafia', tag: 'serious', skill: 'Tagih Pajak', desc: 'Minta jatah ikan tiap kali majikan buka kulkas.', flavor: 'Mana. Bagian aku.' },
        { name: 'Kucing Kacamata', tag: 'sunglasses', skill: 'Mode Santai', desc: 'Tetap kalem walau baru aja mecahin gelas.', flavor: 'Santai. Bukan aku.' }
    ],
    A: [
        { name: 'Kucing Polite', tag: 'cute', skill: 'Senyum Sopan', desc: 'Nolak halus tapi tetap ambil makanan di meja.', flavor: 'Permisi. Ambil tuna.' },
        { name: 'Kucing Zoomies', tag: 'jump', skill: 'Lari Jam 3 Pagi', desc: 'Sprint keliling rumah tanpa alasan jelas.', flavor: 'Lari. Nabrak tembok.' },
        { name: 'Kucing Kardus', tag: 'box', skill: 'Masuk Kotak Sempit', desc: 'Muat di kardus sekecil apa pun dengan bangga.', flavor: 'Sempit. Tapi nyaman.' },
        { name: 'Kucing Ngintip', tag: 'hiding', skill: 'Mata-Mata Pintu', desc: 'Ngawasin majikan dari balik pintu kamar mandi.', flavor: 'Liatin. Terus.' },
        { name: 'Kucing Loaf', tag: 'loaf', skill: 'Roti Tawar', desc: 'Ngumpetin semua kaki biar mirip roti panggang.', flavor: 'Roti. Jangan pegang.' }
    ],
    B: [
        { name: 'Huh Cat', tag: 'confused', skill: 'Hah Mode', desc: 'Muter kepala pas ditanya siapa yang numpahin air.', flavor: 'Hah. Bukan aku.' },
        { name: 'Kucing Marah', tag: 'angry', skill: 'Cakar Sofa', desc: 'Ngegas kalau pintu kamar ditutup.', flavor: 'Buka. Sekarang.' },
        { name: 'Kucing Kaget', tag: 'shocked', skill: 'Mata Melotot', desc: 'Loncat tinggi gara-gara lihat timun di lantai.', flavor: 'Kaget. Itu apaan.' },
        { name: 'Kucing Ngemis', tag: 'begging', skill: 'Cakar Lutut', desc: 'Narik celana pas majikan lagi makan ayam.', flavor: 'Bagi. Dikit aja.' },
        { name: 'Kucing Jutek', tag: 'grumpy', skill: 'Muka Bete', desc: 'Noleh ke tembok pas dipanggil namanya.', flavor: 'Males. Jangan panggil.' }
    ],
    C: [
        { name: 'Kucing Nangis', tag: 'sad', skill: 'Meow Sedih', desc: 'Muka melas minta nambah jatah makan malam.', flavor: 'Sedih. Minta tuna.' },
        { name: 'Kucing Rebahan', tag: 'sleeping', skill: 'Nempel Lantai', desc: 'Gak mau gerak seharian di tengah ruang tamu.', flavor: 'Males. Geser sana.' },
        { name: 'Kucing Bengong', tag: 'stare', skill: 'Natap Tembok', desc: 'Melamun ngeliatin tembok kosong selama 20 menit.', flavor: 'Kosong. Kayak dompet.' },
        { name: 'Kucing Melet', tag: 'blep', skill: 'Lupa Masuk Lidah', desc: 'Lidahnya nongol dikit habis jilat bulu.', flavor: 'Blep. Lupa.' },
        { name: 'Kucing Kepo', tag: 'curious', skill: 'Endus Tas', desc: 'Harus ngecek isi semua kantong belanjaan baru.', flavor: 'Apa tuh. Sini cek.' },
        { name: 'Kucing Lapar', tag: 'hungry', skill: 'Gigit Kardus', desc: 'Ngunyah kardus paket gara-gara telat makan.', flavor: 'Lapar. Makan apa aja.' }
    ]
};

function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function rollRarity(pityCount = 0) {
    if (pityCount >= PITY_LIMIT - 1) {
        // Hard pity on 10th pull: guaranteed S (80%) or SS (20%)
        return Math.random() < 0.2
            ? RARITY_TABLE.find(t => t.rarity === 'SS')
            : RARITY_TABLE.find(t => t.rarity === 'S');
    }
    const roll = Math.random() * 100;
    let acc = 0;
    for (const tier of RARITY_TABLE) {
        acc += tier.weight;
        if (roll < acc) return tier;
    }
    return RARITY_TABLE[RARITY_TABLE.length - 1];
}

class GameService {
    parseCommand(content) {
        const trimmed = (content || '').trim();
        const match = trimmed.match(/^(?:m|milo)\s+([a-z]+)(?:\s+(.*))?$/i);
        if (!match) return null;

        const cmd = match[1].toLowerCase();
        const args = match[2] ? match[2].trim().split(/\s+/) : [];
        return { cmd, args };
    }

    async rewardChat(userId) {
        try {
            await tcgRepo.awardChatTuna(userId, CHAT_TUNA_REWARD, CHAT_COOLDOWN_MS);
        } catch (e) {
            console.warn('[GameService] Failed to reward chat tuna:', e.message);
        }
    }

    async handleTuna(userId) {
        const p = await tcgRepo.getOrCreateProfile(userId);
        const count = await tcgRepo.getUserCardCount(userId);
        return `Saldo: **${p.tuna} tuna**. Koleksi: **${count} kartu**. Pity S/SS: **${p.pity_count || 0}/${PITY_LIMIT}**.`;
    }

    async handleMessage(message) {
        const parsed = this.parseCommand(message.content);
        if (!parsed) return null;

        const { cmd, args } = parsed;
        const userId = message.author.id;

        if (cmd === 'tuna' || cmd === 'bal' || cmd === 'balance') {
            const p = await tcgRepo.getOrCreateProfile(userId);
            const count = await tcgRepo.getUserCardCount(userId);
            return `Saldo: **${p.tuna} tuna**. Koleksi: **${count} kartu**.`;
        }

        if (cmd === 'gacha' || cmd === 'pull') {
            return await this.handleGacha(userId);
        }

        if (cmd === 'cards' || cmd === 'inv' || cmd === 'koleksi') {
            return await this.handleListCards(userId);
        }

        if (cmd === 'card' || cmd === 'view') {
            return await this.handleViewCard(userId, args[0]);
        }

        if (cmd === 'sell' || cmd === 'recycle') {
            return await this.handleRecycle(userId, args[0]);
        }

        if (cmd === 'trade') {
            return await this.handleTrade(message, args);
        }

        if (cmd === 'accept') {
            return await this.handleAcceptTrade(userId);
        }

        if (cmd === 'decline' || cmd === 'reject') {
            return await this.handleDeclineTrade(userId);
        }

        if (cmd === 'game' || cmd === 'games') {
            return [
                'Game TCG Milo:',
                `- \`m tuna\` — cek saldo tuna`,
                `- \`m gacha\` — tarik 1 kartu (${GACHA_COST} tuna)`,
                `- \`m cards\` — lihat koleksi kartu`,
                `- \`m card <id>\` — lihat gambar kartu`,
                `- \`m sell <id>\` — recycle kartu jadi tuna`,
                `- \`m trade @user <id_kamu> <id_dia>\` — tukar kartu`
            ].join('\n');
        }

        return null;
    }

    async handleGacha(userId) {
        const profile = await tcgRepo.getOrCreateProfile(userId);
        if (profile.tuna < GACHA_COST) {
            return `Tuna kurang. Saldo **${profile.tuna} tuna**, butuh **${GACHA_COST} tuna**. Chat dulu atau \`/g sell <id>\`.`;
        }

        const currentPity = profile.pity_count || 0;
        const pityTriggered = currentPity >= PITY_LIMIT - 1;
        const tier = rollRarity(currentPity);
        const nextPity = (tier.rarity === 'S' || tier.rarity === 'SS') ? 0 : currentPity + 1;

        const pool = CARD_TEMPLATES[tier.rarity] || CARD_TEMPLATES.C;
        const tpl = pool[Math.floor(Math.random() * pool.length)];
        const excludedUrls = await tcgRepo.getImageUrlsUsedByOtherRarities(tier.rarity);
        const meme = await cardRenderer.fetchRandomCatMeme(tier.rarity, excludedUrls, tpl.tag);
        const artBuffer = await cardRenderer.downloadArtBuffer(meme.url);

        // Use Gemini Vision to generate name/skill/flavor that actually matches the cat photo
        const aiMeta = await geminiService.describeCatMemeCard(artBuffer, tier.rarity);
        const cardName = aiMeta?.name || (meme.fromReddit && meme.title ? meme.title.slice(0, 24).trim() : tpl.name);

        const cardData = {
            name: cardName,
            rarity: tier.rarity,
            image_url: meme.url,
            skill_name: aiMeta?.skill || tpl.skill,
            skill_desc: aiMeta?.desc || tpl.desc,
            flavor_text: aiMeta?.flavor || tpl.flavor,
            atk: randInt(tier.atkMin, tier.atkMax),
            sleep: randInt(tier.sleepMin, tier.sleepMax),
            recycle_value: tier.recycle
        };

        const updated = await tcgRepo.addTuna(userId, -GACHA_COST);
        await tcgRepo.setPityCount(userId, nextPity);
        const { userCardId } = await tcgRepo.createCardAndAssign(userId, cardData);
        const pngBuffer = await cardRenderer.renderCardPng({ ...cardData, user_card_id: userCardId }, artBuffer);

        const attachment = new AttachmentBuilder(pngBuffer, { name: `milo-card-${userCardId}.jpg` });
        const pityNote = pityTriggered ? ' [PITY!]' : '';
        return {
            content: `Dapet **#${userCardId} ${cardData.name}** [${cardData.rarity}]${pityNote}. Sisa saldo: **${updated.tuna} tuna** (Pity: ${nextPity}/${PITY_LIMIT}).`,
            files: [attachment]
        };
    }

    async handleListCards(userId) {
        const cards = await tcgRepo.getUserCards(userId);
        if (cards.length === 0) {
            return 'Kosong. Belum punya kartu. Pakai `/g gacha`.';
        }
        const lines = cards.slice(0, 20).map(c =>
            `- **#${c.user_card_id}** ${c.name} [${c.rarity}] (ATK ${c.atk} | Recycle ${c.recycle_value} tuna)`
        );
        const more = cards.length > 20 ? `\n...dan ${cards.length - 20} kartu lagi.` : '';
        return `Koleksi (${cards.length} kartu):\n${lines.join('\n')}${more}`;
    }

    async handleViewCard(userId, rawId) {
        const id = parseInt(String(rawId || '').replace('#', ''), 10);
        if (!id) return 'Sebut ID kartu. Contoh: `m card 1`';

        const card = await tcgRepo.getUserCardById(id, userId);
        if (!card) return `Kartu #${id} gak ketemu di koleksimu.`;

        const pngBuffer = await cardRenderer.renderCardPng(card);
        const attachment = new AttachmentBuilder(pngBuffer, { name: `milo-card-${id}.jpg` });
        return {
            content: `Kartu **#${id} ${card.name}** [${card.rarity}]`,
            files: [attachment]
        };
    }

    async handleRecycle(userId, rawId) {
        const id = parseInt(String(rawId || '').replace('#', ''), 10);
        if (!id) return 'Sebut ID kartu. Contoh: `m sell 1`';

        const card = await tcgRepo.getUserCardById(id, userId);
        if (!card) return `Kartu #${id} gak ketemu di koleksimu.`;

        const deleted = await tcgRepo.deleteUserCard(id, userId);
        if (!deleted) return `Gagal recycle kartu #${id}.`;

        const updated = await tcgRepo.addTuna(userId, card.recycle_value);
        return `Recycle **#${id} ${card.name}** -> +**${card.recycle_value} tuna**. Saldo: **${updated.tuna} tuna**.`;
    }

    async handleTradeOffer(fromUserId, targetUser, myCardId, theirCardId) {
        if (!targetUser || targetUser.bot || targetUser.id === fromUserId) {
            return 'User target gak valid.';
        }

        const myCard = await tcgRepo.getUserCardById(myCardId, fromUserId);
        if (!myCard) return `Kartu #${myCardId} bukan punyamu.`;

        const theirCard = await tcgRepo.getUserCardById(theirCardId, targetUser.id);
        if (!theirCard) return `Kartu #${theirCardId} bukan punya <@${targetUser.id}>.`;

        await tcgRepo.createTrade(fromUserId, targetUser.id, myCardId, theirCardId);
        return `Tawaran tukar untuk <@${targetUser.id}>:\n- Kamu dapat: **#${myCardId} ${myCard.name}** [${myCard.rarity}]\n- Kamu kasih: **#${theirCardId} ${theirCard.name}** [${theirCard.rarity}]\nPakai \`/g accept\` untuk setuju, atau \`/g decline\` untuk batal.`;
    }

    async handleTrade(message, args) {
        const targetUser = message.mentions.users.first();
        if (!targetUser || targetUser.bot || targetUser.id === message.author.id) {
            return 'Format: `/g trade @user <id_kartu_kamu> <id_kartu_dia>`';
        }

        const numericArgs = args.filter(a => !a.startsWith('<@')).map(a => parseInt(a.replace('#', ''), 10)).filter(Boolean);
        if (numericArgs.length < 2) {
            return 'Format: `/g trade @user <id_kartu_kamu> <id_kartu_dia>`';
        }

        return await this.handleTradeOffer(message.author.id, targetUser, numericArgs[0], numericArgs[1]);
    }

    async handleAcceptTrade(userId) {
        const trade = await tcgRepo.getPendingTradeForUser(userId);
        if (!trade) return 'Gak ada tawaran trade.';

        const ageMs = Date.now() - new Date(trade.created_at).getTime();
        if (ageMs > 5 * 60 * 1000) {
            await tcgRepo.cancelTrade(trade.id);
            return 'Trade kedaluwarsa. Minta ajukan ulang.';
        }

        const fromCard = await tcgRepo.getUserCardById(trade.from_user_card_id, trade.from_user_id);
        const toCard = await tcgRepo.getUserCardById(trade.to_user_card_id, trade.to_user_id);
        if (!fromCard || !toCard) {
            await tcgRepo.cancelTrade(trade.id);
            return 'Trade batal. Salah satu kartu udah pindah.';
        }

        await tcgRepo.completeTrade(trade.id, trade.from_user_id, trade.to_user_id, trade.from_user_card_id, trade.to_user_card_id);
        return `Done. **#${fromCard.user_card_id} ${fromCard.name}** <-> **#${toCard.user_card_id} ${toCard.name}** berhasil ditukar.`;
    }

    async handleDeclineTrade(userId) {
        const trade = await tcgRepo.getPendingTradeForUser(userId);
        if (!trade) return 'Gak ada tawaran trade.';
        await tcgRepo.cancelTrade(trade.id);
        return 'Trade ditolak.';
    }
}

module.exports = new GameService();
