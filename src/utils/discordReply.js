const MAX_MESSAGE_LENGTH = 1950;

/**
 * Split a long message on line boundaries and send via editReply + followUp
 * so Discord's 2000-char limit never drops /status or /end summaries.
 */
async function sendLongReply(interaction, content) {
    if (!content || content.length <= MAX_MESSAGE_LENGTH) {
        return interaction.editReply(content);
    }

    const chunks = [];
    let current = '';

    for (const line of content.split('\n')) {
        if (line.length > MAX_MESSAGE_LENGTH) {
            if (current) {
                chunks.push(current);
                current = '';
            }
            for (let i = 0; i < line.length; i += MAX_MESSAGE_LENGTH) {
                chunks.push(line.slice(i, i + MAX_MESSAGE_LENGTH));
            }
            continue;
        }

        const candidate = current ? `${current}\n${line}` : line;
        if (candidate.length > MAX_MESSAGE_LENGTH) {
            chunks.push(current);
            current = line;
        } else {
            current = candidate;
        }
    }

    if (current) {
        chunks.push(current);
    }

    await interaction.editReply(chunks[0]);
    for (let i = 1; i < chunks.length; i++) {
        await interaction.followUp(chunks[i]);
    }
}

module.exports = { sendLongReply };
