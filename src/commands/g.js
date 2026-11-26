const { SlashCommandBuilder } = require('discord.js');
const gameService = require('../services/GameService');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('g')
        .setDescription('Milo Cat-Meme TCG game.')
        .addSubcommand(sub =>
            sub.setName('tuna')
                .setDescription('Cek saldo tuna dan jumlah kartu.')
        )
        .addSubcommand(sub =>
            sub.setName('gacha')
                .setDescription('Tarik 1 kartu cat-meme random (10 tuna).')
        )
        .addSubcommand(sub =>
            sub.setName('cards')
                .setDescription('Lihat semua kartu di koleksimu.')
        )
        .addSubcommand(sub =>
            sub.setName('card')
                .setDescription('Lihat gambar kartu berdasarkan ID.')
                .addIntegerOption(opt =>
                    opt.setName('id')
                        .setDescription('ID kartu (lihat /g cards)')
                        .setRequired(true)
                        .setMinValue(1)
                )
        )
        .addSubcommand(sub =>
            sub.setName('sell')
                .setDescription('Recycle kartu jadi tuna.')
                .addIntegerOption(opt =>
                    opt.setName('id')
                        .setDescription('ID kartu yang mau dijual')
                        .setRequired(true)
                        .setMinValue(1)
                )
        )
        .addSubcommand(sub =>
            sub.setName('trade')
                .setDescription('Ajukan tukar kartu dengan user lain.')
                .addUserOption(opt =>
                    opt.setName('user')
                        .setDescription('User yang mau diajak tukar')
                        .setRequired(true)
                )
                .addIntegerOption(opt =>
                    opt.setName('my_card')
                        .setDescription('ID kartu kamu')
                        .setRequired(true)
                        .setMinValue(1)
                )
                .addIntegerOption(opt =>
                    opt.setName('their_card')
                        .setDescription('ID kartu dia')
                        .setRequired(true)
                        .setMinValue(1)
                )
        )
        .addSubcommand(sub =>
            sub.setName('accept')
                .setDescription('Terima tawaran trade yang masuk.')
        )
        .addSubcommand(sub =>
            sub.setName('decline')
                .setDescription('Tolak tawaran trade yang masuk.')
        ),

    async execute(interaction) {
        await interaction.deferReply();
        const sub = interaction.options.getSubcommand();
        const userId = interaction.user.id;
        let result;

        if (sub === 'tuna') {
            result = await gameService.handleTuna(userId);
        } else if (sub === 'gacha') {
            result = await gameService.handleGacha(userId);
        } else if (sub === 'cards') {
            result = await gameService.handleListCards(userId);
        } else if (sub === 'card') {
            result = await gameService.handleViewCard(userId, interaction.options.getInteger('id'));
        } else if (sub === 'sell') {
            result = await gameService.handleRecycle(userId, interaction.options.getInteger('id'));
        } else if (sub === 'trade') {
            const targetUser = interaction.options.getUser('user');
            const myCardId = interaction.options.getInteger('my_card');
            const theirCardId = interaction.options.getInteger('their_card');
            result = await gameService.handleTradeOffer(userId, targetUser, myCardId, theirCardId);
        } else if (sub === 'accept') {
            result = await gameService.handleAcceptTrade(userId);
        } else if (sub === 'decline') {
            result = await gameService.handleDeclineTrade(userId);
        }

        await interaction.editReply(result || 'Gak ngerti.');
    }
};
