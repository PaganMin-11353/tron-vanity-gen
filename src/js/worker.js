/**
 * TRON & Ethereum Vanity Address Generator - Worker
 * Uses TronWeb and Ethers.js for address generation.
 */

// Track initialization state
let isInitialized = false;
let initError = null;

// Try to load dependencies with error handling (pinned versions for stability)
try {
    importScripts('https://cdn.jsdelivr.net/npm/tronweb@6.0.0/dist/TronWeb.js');
    importScripts('https://cdn.jsdelivr.net/npm/ethers@6.13.4/dist/ethers.umd.min.js');
    isInitialized = true;
} catch (err) {
    initError = err.message || 'Failed to load crypto libraries';
}

let isRunning = false;
let totalHashes = 0;
let lastReportTime = 0;
let hashesSinceLastReport = 0;

/**
 * Generate address using JS libraries.
 */
function generateAddress(network) {
    if (network === 'eth') {
        const wallet = ethers.Wallet.createRandom();
        return {
            address: wallet.address,
            privateKey: wallet.privateKey
        };
    } else {
        const account = TronWeb.utils.accounts.generateAccount();
        return {
            address: account.address.base58,
            privateKey: account.privateKey
        };
    }
}

/**
 * Main loop for the worker.
 */
function loop(prefix, suffix, network) {
    if (!isRunning) return;

    // Process in batches for UI responsiveness
    const batchSize = 100;

    for (let i = 0; i < batchSize; i++) {
        if (!isRunning) return; // Check between iterations for faster stop

        const { address, privateKey } = generateAddress(network);

        totalHashes++;
        hashesSinceLastReport++;

        let matchesPrefix = true;
        let matchesSuffix = true;

        if (network === 'eth') {
            const cleanAddress = address.toLowerCase();
            const cleanPrefix = prefix.toLowerCase();
            const cleanSuffix = suffix.toLowerCase();

            if (prefix) matchesPrefix = cleanAddress.substring(2).startsWith(cleanPrefix);
            if (suffix) matchesSuffix = cleanAddress.endsWith(cleanSuffix);
        } else {
            // TRON: starts with T, prefix matches after T
            const addressBody = address.substring(1);
            if (prefix) matchesPrefix = addressBody.startsWith(prefix);
            if (suffix) matchesSuffix = address.endsWith(suffix);
        }

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

    // Recursively call using setTimeout to allow for event loop and potential termination
    setTimeout(() => loop(prefix, suffix, network), 0);
}

onmessage = function(e) {
    const { command, prefix, suffix, network } = e.data;

    if (command === 'start') {
        // Check if libraries loaded successfully
        if (!isInitialized) {
            postMessage({
                type: 'error',
                data: { message: initError || 'Failed to initialize worker' }
            });
            return;
        }

        isRunning = true;
        totalHashes = 0;
        lastReportTime = Date.now();
        hashesSinceLastReport = 0;
        loop(prefix, suffix, network);
    }
};
