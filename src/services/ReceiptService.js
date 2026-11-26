const receiptRepo = require('../data/repositories/ReceiptRepository');
const geminiService = require('./GeminiService');
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

        // 2. No active state, analyze text
        const analysis = await geminiService.analyzeText(msg.content, history, meta);

        if (analysis.intent === 'IGNORE') {
            return null;
        }

        if (analysis.intent === 'CHAT') {
            return analysis.response || null;
        }

        if (analysis.intent === 'RECEIPT') {
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
