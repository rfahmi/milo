process.env.UNDICI_NO_WASM = '1';        // paksa Undici tanpa WASM
process.env.NODE_OPTIONS = process.env.NODE_OPTIONS || '--max-old-space-size=256';

process.chdir(__dirname);
require('dotenv').config();
require('./src/index.js');
