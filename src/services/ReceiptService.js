const receiptRepo = require('../data/repositories/ReceiptRepository');
const memoryRepo = require('../data/repositories/MemoryRepository');
const geminiService = require('./GeminiService');
const config = require('../config');
const t = require('../utils/translations');

// In-flight guard: tracks attachment IDs currently being processed.
// Prevents a race where the live MessageCreate handler and processBacklog
// both pass the DB dedup check before either has committed, causing Gemini
// to be called twice for the same attachment.
const inFlightAttachments = new Set();

class ReceiptService {
    async startCheckpoint(channelId, messageId) {
        const active = await receiptRepo.getActiveCheckpoint(channelId);
        if (active) {
            return { success: false, message: t.commands.start.alreadyActive(active.id) };
        }
        const id = await receiptRepo.createCheckpoint(channelId, messageId);
        return { success: true, message: t.commands.start.success(id) };
    }

    async endCheckpoint(channelId, messageId) {
        const active = await receiptRepo.getActiveCheckpoint(channelId);
        if (!active) {
            return { success: false, message: t.commands.end.noCheckpoint() };
        }

        await receiptRepo.closeCheckpoint(active.id, messageId);
        const receipts = await receiptRepo.getReceiptsForCheckpoint(active.id);

        if (receipts.length === 0) {
            return { success: true, message: t.commands.end.noReceipts(active.id) };
        }

        const summary = this.calculateSummary(receipts);
        const { details, grandTotal } = this.formatSummary(summary, receipts);
        return { success: true, message: t.commands.end.success(active.id, details, grandTotal) };
    }

    async status(channelId) {
        const active = await receiptRepo.getActiveCheckpoint(channelId);
        if (!active) {
            return { success: false, message: t.commands.status.noCheckpoint() };
        }

        const receipts = await receiptRepo.getReceiptsForCheckpoint(active.id);

        if (receipts.length === 0) {
            return { success: true, message: t.commands.status.noReceipts(active.id) };
        }

        const summary = this.calculateSummary(receipts);
        const { details, grandTotal } = this.formatSummary(summary, receipts);
        return { success: true, message: t.commands.status.running(active.id, details, grandTotal) };
    }

    calculateSummary(receipts) {
        const userMap = new Map();

        // Receipts are ordered by created_at ASC, so later receipts overwrite the name
        for (const r of receipts) {
            const current = userMap.get(r.user_id) || { total: 0, user_name: r.user_name, user_id: r.user_id };
            current.total += r.amount;
            current.user_name = r.user_name; // Always update to latest name
            userMap.set(r.user_id, current);
        }

        return Array.from(userMap.values()).sort((a, b) => b.total - a.total);
    }

    async undo(channelId) {
        const latest = await receiptRepo.getLatestCheckpoint(channelId);
        if (!latest) {
            return { success: false, message: t.commands.undo.noCheckpoint() };
        }

        if (latest.closed_at) {
            return { success: false, message: 'Checkpoint udah ditutup. Pake /unclose dulu.' };
        }

        const receipts = await receiptRepo.getReceiptsForCheckpoint(latest.id);
        if (receipts.length > 0) {
            return { success: false, message: 'Gak bisa undo, udah ada struk masuk.' };
        }

        await receiptRepo.deleteCheckpoint(latest.id);
        return { success: true, message: t.commands.undo.success(latest.id) };
    }

    async unclose(channelId) {
        // Fail fast: nothing to reopen if there are no closed checkpoints at all.
        const lastClosed = await receiptRepo.getLastClosedCheckpoint();
        if (!lastClosed) {
            return { success: false, message: t.commands.unclose.noClosedCheckpoint() };
        }

        // If there's a currently active checkpoint, check its state.
        const active = await receiptRepo.getActiveCheckpoint(channelId);
        if (active) {
            const activeReceipts = await receiptRepo.getReceiptsForCheckpoint(active.id);
            if (activeReceipts.length > 0) {
                // Active checkpoint already has receipts — can't unclose safely.
                return {
                    success: false,
                    message: t.commands.unclose.hasActiveWithReceipts(active.id)
                };
            }
            // Active checkpoint is empty (accidental /start) — remove it so we
            // can cleanly reopen the last closed one.
            await receiptRepo.deleteCheckpoint(active.id);
        }

        await receiptRepo.reopenCheckpoint(lastClosed.id);
        return { success: true, message: t.commands.unclose.success(lastClosed.id) };
    }

    async processAttachment(att, msg, channelId) {
        const active = await receiptRepo.getActiveCheckpoint(channelId);
        if (!active) return null;

        // Check if this specific attachment has already been processed
        const existing = await receiptRepo.getReceiptByAttachmentId(att.id);
        if (existing) {
            console.log(`[ReceiptService] Skipping already processed attachment ${att.id} (message ${msg.id})`);
            return null;
        }

        // Guard against concurrent processing of the same attachment
        // (e.g. live MessageCreate fires while backlog loop is mid-flight for the same ID)
        if (inFlightAttachments.has(att.id)) {
            console.log(`[ReceiptService] Attachment ${att.id} already in-flight, skipping duplicate call`);
            return null;
        }
        inFlightAttachments.add(att.id);

        try {
            const { amount, description } = await geminiService.extractTotal(att.url);
            const receiptId = await receiptRepo.addReceipt({
                user_id: msg.author.id,
                user_name: msg.member?.displayName || msg.author.username,
                channel_id: channelId,
                checkpoint_id: active.id,
                message_id: msg.id,
                attachment_id: att.id,
                image_url: att.url,
                amount: amount,
                description: description,
                created_at: new Date().toISOString()
            });

            if (receiptId) {
                const orderNumber = await receiptRepo.getReceiptCountForCheckpoint(active.id);
                const ack = t.receipts.acknowledged(active.id, orderNumber, msg.member?.displayName || msg.author.username, amount.toLocaleString('id-ID'));
                return description ? `${ack} (${description})` : ack;
            }
        } catch (e) {
            console.log(`Not a receipt (${att.url}): ${e.message}`);
            const sassy = await geminiService.generateSassyComment(att.url);
            return { reply: sassy, reference: true }; // Special object for reply with reference
        } finally {
            inFlightAttachments.delete(att.id);
        }
        return null;
    }

    async processText(msg, channelId, history, meta = {}) {
        const conversationRepo = require('../data/repositories/ConversationRepository');

        // 1. Check for active state (e.g., waiting for description), with 10-min TTL
        const STATE_TTL_MS = 10 * 60 * 1000;
        const activeState = await conversationRepo.getState(msg.author.id, channelId);

        if (activeState && activeState.state === 'WAITING_FOR_DESCRIPTION' && activeState.data.amount) {
            const ageMs = activeState.updated_at ? (Date.now() - new Date(activeState.updated_at).getTime()) : Infinity;
            if (ageMs > STATE_TTL_MS) {
                await conversationRepo.clearState(msg.author.id, channelId);
            } else if (/^(batal|cancel|gak jadi|ga jadi|nggak jadi|skip)$/i.test(msg.content.trim())) {
                await conversationRepo.clearState(msg.author.id, channelId);
                return 'Batal.';
            } else {
                // User provided description for a pending amount
                const amount = activeState.data.amount;
                const description = msg.content;

                // Check for active checkpoint
                const activeCheckpoint = await receiptRepo.getActiveCheckpoint(channelId);
                if (!activeCheckpoint) {
                    await conversationRepo.clearState(msg.author.id, channelId);
                    return t.commands.start.alreadyActive(0).replace('0', '?'); // Fallback explanation
                }

                // Add receipt
                const receiptId = await receiptRepo.addReceipt({
                    user_id: msg.author.id,
                    user_name: msg.member?.displayName || msg.author.username,
                    channel_id: channelId,
                    checkpoint_id: activeCheckpoint.id,
                    message_id: msg.id,
                    image_url: null, // No image
                    amount: amount,
                    description: description,
                    created_at: new Date().toISOString()
                });

                await conversationRepo.clearState(msg.author.id, channelId);

                const orderNumber = await receiptRepo.getReceiptCountForCheckpoint(activeCheckpoint.id);
                return t.receipts.acknowledged(activeCheckpoint.id, orderNumber, msg.member?.displayName || msg.author.username, amount.toLocaleString('id-ID')) + ` (${description})`;
            }
        }

        // 1b. Check for pending destructive action confirmation (5-min TTL)
        const CONFIRM_TTL_MS = 5 * 60 * 1000;
        if (activeState && activeState.state === 'WAITING_FOR_ACTION_CONFIRM' && activeState.data.action) {
            const ageMs = activeState.updated_at ? (Date.now() - new Date(activeState.updated_at).getTime()) : Infinity;
            const trimmed = msg.content.trim();
            if (ageMs > CONFIRM_TTL_MS) {
                await conversationRepo.clearState(msg.author.id, channelId);
            } else if (/^(ya|yes|iya|confirm|lanjut|oke|ok|gas)$/i.test(trimmed)) {
                await conversationRepo.clearState(msg.author.id, channelId);
                return await this.executeConfirmedAction(activeState.data.action, activeState.data.params || {}, channelId);
            } else if (/^(batal|no|tidak|cancel|gak jadi|ga jadi|nggak jadi)$/i.test(trimmed)) {
                await conversationRepo.clearState(msg.author.id, channelId);
                return 'Batal.';
            }
        }

        // 2. Skip messages obviously addressed to Ose (e.g. "Se", "Ose", "Se lagi dimana") to save Gemini quota
        const isReceiptChannel = meta.isReceiptChannel !== false;
        const addressedByName = /\bmilo\b/i.test(msg.content);
        const addressesMilo = meta.isMentioningMilo || meta.isReplyToMilo || addressedByName;
        if (!addressesMilo && /\b(ose|se)\b/i.test(msg.content)) {
            return null;
        }

        // 3. Analyze text with Gemini (decides RECEIPT / ACTION / CHAT / IGNORE from context & history)
        const analysis = await geminiService.analyzeText(msg.content, history, {
            ...meta,
            addressedByName
        });

        console.log(`[DEBUG] analyzeText result: intent=${analysis.intent}, action=${analysis.action || 'none'}`);

        if (analysis.intent === 'IGNORE') {
            return null;
        }

        if (analysis.auto_memory && analysis.auto_memory.content) {
            try {
                await memoryRepo.addMemory({
                    scope: 'global',
                    kind: analysis.auto_memory.kind || 'fact',
                    content: analysis.auto_memory.content,
                    createdBy: msg.author.id
                });
            } catch (e) {
                console.warn('[ReceiptService] Failed to save auto_memory:', e.message);
            }
        }

        if (analysis.intent === 'ACTION' && analysis.action) {
            return await this.handleAction(analysis.action, analysis.params || {}, msg, channelId, conversationRepo, isReceiptChannel);
        }

        if (analysis.intent === 'CHAT') {
            return analysis.response || null;
        }

        if (analysis.intent === 'RECEIPT') {
            if (!isReceiptChannel) {
                return config.discord.channelId
                    ? `Catat struk cuma di <#${config.discord.channelId}>.`
                    : 'Catat struk cuma di channel struk.';
            }
            const activeCheckpoint = await receiptRepo.getActiveCheckpoint(channelId);
            if (!activeCheckpoint) {
                return "Belum ada checkpoint jalan. /start dulu.";
            }

            if (analysis.amount && !analysis.item) {
                // Amount found, but no description. Ask for clarification.
                await conversationRepo.setState(msg.author.id, channelId, 'WAITING_FOR_DESCRIPTION', { amount: analysis.amount });
                return analysis.response; // "Buat apa nih?"
            }

            if (analysis.amount) { // Amount AND Item found (or Item not strictly required if Gemini deems it complete)
                // If item is null but Gemini didn't ask response, treat as valid receipt without desc?
                // Prompt says: "If item is missing (null): Provide a short... question". 
                // So if response implies question, I should have set state? 
                // My logic above relies on Gemini response string. 

                // Re-reading logic:
                // Gemini returns { amount: 123, item: null, response: "Buat apa?" } -> Intent RECEIPT.
                // So check if item is null.

                if (!analysis.item) {
                    // Double check: Gemini response is likely a question.
                    await conversationRepo.setState(msg.author.id, channelId, 'WAITING_FOR_DESCRIPTION', { amount: analysis.amount });
                    return analysis.response;
                }

                // Full receipt
                const receiptId = await receiptRepo.addReceipt({
                    user_id: msg.author.id,
                    user_name: msg.member?.displayName || msg.author.username,
                    channel_id: channelId,
                    checkpoint_id: activeCheckpoint.id,
                    message_id: msg.id,
                    image_url: null,
                    amount: analysis.amount,
                    description: analysis.item,
                    created_at: new Date().toISOString()
                });

                const orderNumber = await receiptRepo.getReceiptCountForCheckpoint(activeCheckpoint.id);
                return t.receipts.acknowledged(activeCheckpoint.id, orderNumber, msg.member?.displayName || msg.author.username, analysis.amount.toLocaleString('id-ID')) + ` (${analysis.item})`;
            }
        }

        return null;
    }

    async handleAction(action, params, msg, channelId, conversationRepo, isReceiptChannel = true) {
        if (action === 'LIST_CHECKPOINTS') {
            const rows = await receiptRepo.getAllCheckpointsWithCounts();
            if (rows.length === 0) return 'DB kosong. Gak ada checkpoint.';
            const activeCount = rows.filter(r => !r.closed_at).length;
            const closedCount = rows.length - activeCount;
            const lines = rows.map(r =>
                `- #${r.id}: ${r.closed_at ? 'tutup' : 'aktif'}, ${r.receipt_count} struk (Rp${Number(r.total_amount).toLocaleString('id-ID')})`
            );
            return `Total: ${rows.length} checkpoint (${activeCount} aktif, ${closedCount} tutup).\n${lines.join('\n')}`;
        }

        if (action === 'CHECKPOINT_STATUS') {
            const active = await receiptRepo.getActiveCheckpoint(channelId);
            if (!active) return 'Gak ada checkpoint aktif.';
            const receipts = await receiptRepo.getReceiptsForCheckpoint(active.id);
            const total = receipts.reduce((sum, r) => sum + r.amount, 0);
            return `Checkpoint #${active.id} aktif. ${receipts.length} struk. Total Rp${total.toLocaleString('id-ID')}.`;
        }

        if (action === 'LIST_MEMORIES') {
            const memories = await memoryRepo.getRecentMemories(40);
            if (memories.length === 0) return 'Kosong. Belum ada yang aku inget.';
            const lines = memories.map(m => `- #${m.id} [${m.kind}] ${m.content}`);
            return `Yang aku inget (${memories.length}):\n${lines.join('\n')}`;
        }

        if (action === 'REMEMBER') {
            const content = (params.content || '').trim();
            if (!content) return 'Inget apa. Sebut yang jelas.';
            const kind = ['fact', 'preference', 'rule'].includes(params.kind) ? params.kind : 'fact';
            const saved = await memoryRepo.addMemory({
                scope: 'global',
                kind,
                content,
                createdBy: msg.author.id
            });
            return saved?.deduplicated
                ? `Udah inget (#${saved.id}): "${content}".`
                : `Oke. Inget (#${saved.id} | ${kind}): "${content}".`;
        }

        if (action === 'FORGET_MEMORY') {
            let matches = [];
            if (params.memory_id) {
                const one = await memoryRepo.getMemoryById(Number(params.memory_id));
                if (one) matches = [one];
            } else if (params.query) {
                matches = await memoryRepo.findMemories(params.query);
            }

            if (matches.length === 0) return 'Gak nemu ingatan itu.';

            await conversationRepo.setState(msg.author.id, channelId, 'WAITING_FOR_ACTION_CONFIRM', {
                action,
                params: params.memory_id ? { memory_id: Number(params.memory_id) } : { query: params.query }
            });

            const preview = matches.slice(0, 5).map(m => `- #${m.id} [${m.kind}] ${m.content}`).join('\n');
            const more = matches.length > 5 ? `\n...dan ${matches.length - 5} lagi` : '';
            return `Konfirmasi lupa (${matches.length} ingatan):\n${preview}${more}\nPermanen. Balas "ya" lanjut, "batal" batal.`;
        }

        if (action === 'PICK_RANDOM') {
            const options = Array.isArray(params.options)
                ? params.options.map(o => String(o).trim()).filter(Boolean)
                : [];
            if (options.length < 2) return 'Kasih minimal 2 pilihan.';

            const requested = Math.max(1, parseInt(params.count, 10) || 1);
            const count = Math.min(requested, options.length);

            // Fisher-Yates shuffle for unbiased unique picks
            const pool = [...options];
            for (let i = pool.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [pool[i], pool[j]] = [pool[j], pool[i]];
            }

            const picked = pool.slice(0, count).map(o => `**${o}**`).join(', ');
            return `${picked}.`;
        }

        if (action === 'WEB_SEARCH') {
            const query = (params.query || msg.content || '').trim();
            if (!query) return 'Cari apa. Sebut yang jelas.';
            return await geminiService.searchWeb(query);
        }

        if (action === 'QUERY_DB') {
            const question = (params.question || msg.content || '').trim();
            if (!question) return 'Tanya apa. Sebut yang jelas.';
            return await geminiService.queryDatabaseWithNL(question);
        }

        // Receipt/checkpoint CRUD is restricted to the receipt channel
        const receiptCrudActions = ['DELETE_INACTIVE_CHECKPOINTS', 'DELETE_CHECKPOINT', 'DELETE_RECEIPT'];
        if (!isReceiptChannel && receiptCrudActions.includes(action)) {
            return config.discord.channelId
                ? `Hapus struk/checkpoint cuma di <#${config.discord.channelId}>.`
                : 'Hapus struk/checkpoint cuma di channel struk.';
        }

        // Destructive actions require admin authorization (when DISCORD_ADMIN_USER_ID is configured)
        if (config.discord.adminId && msg.author.id !== config.discord.adminId) {
            return 'Gak boleh. Bukan admin.';
        }

        if (action === 'DELETE_INACTIVE_CHECKPOINTS') {
            const rows = await receiptRepo.getAllCheckpointsWithCounts();
            const inactive = rows.filter(r => r.closed_at);
            if (inactive.length === 0) return 'Kosong. Gak ada checkpoint non-aktif.';

            const ids = inactive.map(r => `#${r.id}`).join(', ');
            const totalReceipts = inactive.reduce((s, r) => s + r.receipt_count, 0);
            const totalAmount = inactive.reduce((s, r) => s + Number(r.total_amount), 0);

            await conversationRepo.setState(msg.author.id, channelId, 'WAITING_FOR_ACTION_CONFIRM', {
                action,
                params: {}
            });

            return `Konfirmasi hapus:\n- ${inactive.length} checkpoint non-aktif (${ids})\n- ${totalReceipts} struk ikut kehapus (Rp${totalAmount.toLocaleString('id-ID')})\nPermanen. Balas "ya" lanjut, "batal" batal.`;
        }

        if (action === 'DELETE_CHECKPOINT') {
            const cpId = Number(params.checkpoint_id);
            if (!cpId) return 'Sebut nomor checkpoint. Contoh: hapus checkpoint #2.';

            const rows = await receiptRepo.getAllCheckpointsWithCounts();
            const target = rows.find(r => r.id === cpId);
            if (!target) return `Checkpoint #${cpId} gak ketemu.`;

            await conversationRepo.setState(msg.author.id, channelId, 'WAITING_FOR_ACTION_CONFIRM', {
                action,
                params: { checkpoint_id: cpId }
            });

            return `Konfirmasi hapus:\n- Checkpoint #${cpId} (${target.closed_at ? 'tutup' : 'aktif'})\n- ${target.receipt_count} struk ikut kehapus (Rp${Number(target.total_amount).toLocaleString('id-ID')})\nPermanen. Balas "ya" lanjut, "batal" batal.`;
        }

        if (action === 'DELETE_RECEIPT') {
            const num = Number(params.receipt_number);
            if (!num) return 'Sebut nomor struk. Contoh: hapus struk #3.';

            const active = await receiptRepo.getActiveCheckpoint(channelId);
            if (!active || active.closed_at !== null) return 'Gak ada checkpoint aktif.';

            const receipts = await receiptRepo.getReceiptsForCheckpoint(active.id);
            const target = receipts[num - 1];
            if (!target) return `Struk #${num} gak ketemu.`;

            await conversationRepo.setState(msg.author.id, channelId, 'WAITING_FOR_ACTION_CONFIRM', {
                action,
                params: { receipt_number: num }
            });

            return `Konfirmasi hapus:\n- Struk #${num}: ${target.user_name} Rp${Number(target.amount).toLocaleString('id-ID')}${target.description ? ` (${target.description})` : ''}\n- Dari Checkpoint #${active.id}\nBalas "ya" lanjut, "batal" batal.`;
        }

        return 'Gak ngerti perintahnya.';
    }

    async deleteReceipt(channelId, receiptNumber) {
        const activeCheckpoint = await receiptRepo.getActiveCheckpoint(channelId);
        if (!activeCheckpoint) {
            return { success: false, message: '❌ Tidak ada checkpoint yang aktif saat ini.' };
        }
        if (activeCheckpoint.closed_at !== null) {
            return { success: false, message: '❌ Checkpoint sudah ditutup. Hanya bisa menghapus transaksi dari checkpoint yang sedang berjalan.' };
        }

        const deletedId = await receiptRepo.deleteReceiptByNumber(activeCheckpoint.id, receiptNumber);
        if (!deletedId) {
            return { success: false, message: `❌ Transaksi nomor ${receiptNumber} tidak ditemukan. Gunakan /status untuk melihat daftar transaksi.` };
        }

        return {
            success: true,
            checkpointId: activeCheckpoint.id,
            deletedId,
            message: `✅ Transaksi nomor ${receiptNumber} berhasil dihapus dari checkpoint #${activeCheckpoint.id}.`
        };
    }

    async executeConfirmedAction(action, params, channelId) {
        if (action === 'DELETE_INACTIVE_CHECKPOINTS') {
            const { checkpointsDeleted, receiptsDeleted } = await receiptRepo.deleteInactiveCheckpoints();
            return `Done. ${checkpointsDeleted} checkpoint non-aktif & ${receiptsDeleted} struk dihapus.`;
        }

        if (action === 'DELETE_CHECKPOINT') {
            const { checkpointsDeleted, receiptsDeleted } = await receiptRepo.deleteCheckpointCascade(params.checkpoint_id);
            if (checkpointsDeleted === 0) return `Checkpoint #${params.checkpoint_id} gak ketemu.`;
            return `Done. Checkpoint #${params.checkpoint_id} & ${receiptsDeleted} struk dihapus.`;
        }

        if (action === 'DELETE_RECEIPT') {
            const res = await this.deleteReceipt(channelId, params.receipt_number);
            if (!res.success) return res.message.replace(/^❌\s*/, '');
            return `Done. Struk #${params.receipt_number} dihapus dari Checkpoint #${res.checkpointId}.`;
        }

        if (action === 'FORGET_MEMORY') {
            let deleted = 0;
            if (params.memory_id) {
                deleted = await memoryRepo.deleteMemoryById(Number(params.memory_id));
            } else if (params.query) {
                deleted = await memoryRepo.deleteMemoriesByQuery(params.query);
            }
            if (deleted === 0) return 'Gak nemu ingatan itu.';
            return `Done. ${deleted} ingatan dilupain.`;
        }

        return 'Batal. Aksi gak dikenal.';
    }

    formatSummary(summaryUsers, receipts) {
        let grandTotal = 0;
        const userLines = summaryUsers.map(u => {
            grandTotal += u.total;
            return t.summary.userLine(u.user_name, u.total.toLocaleString('id-ID'));
        });

        const receiptLines = receipts.map((r, i) => {
            return t.summary.receiptLine(i + 1, r.user_name, r.amount.toLocaleString('id-ID'), r.description);
        });

        const details = [
            t.summary.userTotals,
            ...userLines,
            '',
            t.summary.receiptBreakdown,
            ...receiptLines
        ].join('\n');

        return { details, grandTotal };
    }
}

module.exports = new ReceiptService();
