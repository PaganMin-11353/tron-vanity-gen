/**
 * TRON Vanity Address Generator - Worker
 * Performs the actual brute-force calculation in a background thread.
 */

// Import TronWeb via CDN for standard mode
// In a real worker, we might need to use importScripts if not using a bundler
importScripts('https://cdn.jsdelivr.net/npm/tronweb/dist/TronWeb.js');

let isRunning = false;
let totalHashes = 0;
let lastReportTime = 0;
let hashesSinceLastReport = 0;

/**
 * Generates a random TRON address.
 * Standard mode uses TronWeb which is easy to use but slower.
 * Fast mode (WASM) would ideally use WASM for secp256k1.
 */
function generateAddress(mode) {
    // Note: In a production environment with build tools, 
    // we would use secp256k1 WASM modules for 10-100x speed.
    // For this simple static setup, we use TronWeb's built-in generator.
    const account = TronWeb.utils.accounts.generateAccount();
    return {
        address: account.address.base58,
        privateKey: account.privateKey
    };
}

/**
 * Main loop for the worker.
 */
function work(prefix, suffix) {
    if (!isRunning) return;

    for (let i = 0; i < 100; i++) { // Batch processing for performance
        const { address, privateKey } = generateAddress();
        totalHashes++;
        hashesSinceLastReport++;

        // Validation check
        // address starts with 'T', so prefix matches after 'T'
        const addressBody = address.substring(1);
        const matchesPrefix = prefix ? addressBody.startsWith(prefix) : true;
        const matchesSuffix = suffix ? address.endsWith(suffix) : true;

        if (matchesPrefix && matchesSuffix) {
            postMessage({
                type: 'found',
                data: { address, privateKey }
            });
        }
    }

    // Report stats every 500ms
    const now = Date.now();
    if (now - lastReportTime > 500) {
        postMessage({
            type: 'stats',
            data: {
                totalHashes,
                hashesPerSecond: Math.floor(hashesSinceLastReport / ((now - lastReportTime) / 1000))
            }
        });
        lastReportTime = now;
        hashesSinceLastReport = 0;
    }

    // Use setTimeout to allow for event loop and potential termination
    setTimeout(() => work(prefix, suffix), 0);
}

onmessage = function(e) {
    const { command, prefix, suffix, mode } = e.data;

    if (command === 'start') {
        isRunning = true;
        totalHashes = 0;
        lastReportTime = Date.now();
        hashesSinceLastReport = 0;
        work(prefix, suffix);
    } else if (command === 'stop') {
        isRunning = false;
    }
};
