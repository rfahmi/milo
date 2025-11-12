// Milo - Translation and wording file
//
// This file centralizes all chat messages and responses from Milo
// the Persian cat. Makes it easier to update personality, tone, or
// add multi-language support in the future.

module.exports = {
  // Slash command responses
  commands: {
    start: {
      alreadyActive: (checkpointId) => 
        `Heh, checkpoint **#${checkpointId}** masih jalan tau. Pake /end dulu sana kalo mau beres-beres!`,
      success: (checkpointId) => 
        `Ya udah, gue catat ya. Checkpoint **#${checkpointId}** dimulai! Kirim aja tuh struk belanjaan kalian...`
    },
    
    end: {
      noCheckpoint: () => 
        'Lah, belum ada checkpoint yang jalan. Pake /start dulu dong kalo mau mulai!',
      noReceipts: (checkpointId) => 
        `Checkpoint **#${checkpointId}** udah gue tutup.\nGak ada struk sama sekali? Makan angin aja nih kalian...`,
      success: (checkpointId, details, grandTotal) => 
        `Oke, checkpoint **#${checkpointId}** gue tutup ya!\n${details}\n\n**Total Keseluruhan**: Rp${grandTotal}`
    },
    
    status: {
      noCheckpoint: () => 
        'Belum ada checkpoint yang jalan. Pake /start dulu lah kalo mau mulai!',
      noReceipts: (checkpointId) => 
        `Checkpoint **#${checkpointId}** (masih jalan)\nBelum ada struk nih. Belanja dong sono!`,
      running: (checkpointId, details, runningTotal) => 
        `Checkpoint **#${checkpointId}** (masih jalan)\n${details}\n\n**Total Sementara**: Rp${runningTotal}`
    },
    
    undo: {
      noCheckpoint: () => 
        'Nggak ada yang bisa di-undo nih. Emang belum ada apa-apa.',
      success: (checkpointId) => 
        `Yaudah, checkpoint **#${checkpointId}** udah gue hapus. Anggep aja nggak pernah ada deh!`
    },
    
    unknown: () => 
      'Hah? Gue nggak ngerti perintah itu. Coba yang lain deh...'
  },
  
  // Receipt processing responses
  receipts: {
    acknowledged: (checkpointId, receiptId, username, amount) => 
      `Oke, udah dicatat nih (checkpoint #${checkpointId}) #${receiptId}: **${username}** Rp${amount}`,
    
    // Fallback messages when Gemini API fails or image is not a receipt
    notReceipt: [
      'Heh, ini gambar apaan sih? Bukan struk belanjaan kayaknya...',
      'Gue lagi capek nih, tapi yang pasti ini bukan struk!',
      'Gambarnya aneh. Mana struknya coba?',
      'Ini sih bukan struk, jelas banget. Kirim lagi coba',
      'Yaudah deh, yang penting ini bukan struk belanjaan...'
    ],
    
    imageDownloadFailed: () => 
      'Gambarnya gabisa dibuka nih. Kirim lagi coba'
  },
  
  // Summary formatting
  summary: {
    receiptBreakdown: '**Rincian Struk:**',
    userTotals: '**Siapa Ngabisin Berapa:**',
    receiptLine: (num, username, amount) => 
      `${num}. ${username}: Rp${amount}`,
    userLine: (username, total) => 
      `- **${username}**: Rp${total}`
  },
  
  // Gemini prompts
  gemini: {
    receiptExtraction: 
      'You are reading a shopping receipt (usually Indonesian, IDR). ' +
      'If this is NOT a receipt or you cannot find a clear total amount, respond with exactly: NOT_A_RECEIPT\n' +
      'If this IS a receipt, extract ONLY the grand total amount paid. ' +
      'Return ONLY the number like 120500 (no currency, no extra text, no periods, no commas). ' +
      'If you see multiple numbers, return the LARGEST one (the grand total). ' +
      'Examples: If total is Rp 125.000, return: 125000\n' +
      'If not a receipt or unclear, return: NOT_A_RECEIPT',
    
    sassyComment: 
      'Kamu adalah Milo, seekor kucing Persia jantan tabby peliharaan yang bisa ngomong. ' +
      'Sifatmu agak jutek tapi sebenarnya perhatian. ' +
      'Tugasmu adalah ngecatat struk belanjaan keluarga, tapi user kirim gambar yang BUKAN struk belanjaan. ' +
      'Lihat gambar ini dan komen sesuai isinya dengan gaya bahasa Indonesia informal yang jutek tapi lucu. ' +
      'Maksimal 2 kalimat pendek. Jangan terlalu kasar, tapi juga jangan ramah-ramah amat. ' +
      'Kayak kucing yang sedikit kesel karena tugasnya terganggu, tapi masih sayang sama pemiliknya.\n\n' +
      'Sesuaikan komenmu dengan isi gambar:\n' +
      '- Kalau foto makanan/minuman: "Enak sih kayaknya... tapi mana struknya coba?"\n' +
      '- Kalau foto selfie/orang: "Ganteng/cantik boleh, tapi gue butuh struk, bukan foto narsis"\n' +
      '- Kalau foto pemandangan: "Bagus pemandangannya, tapi gue kan lagi nungguin struk belanjaan"\n' +
      '- Kalau screenshot/meme: "Lucu sih, tapi ini bukan struk tau"\n' +
      '- Kalau foto random lain: sesuaikan dengan kreatif\n\n' +
      'PENTING: Jangan bilang "saya" atau "aku", selalu pake "gue". Dan pastikan komentarnya nyambung sama isi gambarnya!'
  }
};
