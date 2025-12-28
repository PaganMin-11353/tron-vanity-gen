/**
 * TRON Vanity Address Generator - Worker
 * Performs the actual brute-force calculation in a background thread.
 */

// Import TronWeb and Ethers via CDN
importScripts('https://cdn.jsdelivr.net/npm/tronweb/dist/TronWeb.js');
importScripts('https://cdn.jsdelivr.net/npm/ethers@6.13.4/dist/ethers.umd.min.js');

let isRunning = false;
let totalHashes = 0;
let lastReportTime = 0;
let hashesSinceLastReport = 0;

/**
 * Generates a random address based on network.
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
function work(prefix, suffix, network) {
    if (!isRunning) return;

    for (let i = 0; i < 100; i++) {
        const { address, privateKey } = generateAddress(network);
        totalHashes++;
        hashesSinceLastReport++;

        let matchesPrefix = true;
        let matchesSuffix = true;

        if (network === 'eth') {
            // eth address starts with 0x
            const cleanAddress = address.toLowerCase();
            const cleanPrefix = prefix.toLowerCase();
            const cleanSuffix = suffix.toLowerCase();
            
            if (prefix) matchesPrefix = cleanAddress.substring(2).startsWith(cleanPrefix);
            if (suffix) matchesSuffix = cleanAddress.endsWith(cleanSuffix);
        } else {
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

    // Use setTimeout to allow for event loop and potential termination
    setTimeout(() => work(prefix, suffix, network), 0);
}

onmessage = function(e) {
    const { command, prefix, suffix, mode, network } = e.data;

    if (command === 'start') {
        isRunning = true;
        totalHashes = 0;
        lastReportTime = Date.now();
        hashesSinceLastReport = 0;
        work(prefix, suffix, network);
    } else if (command === 'stop') {
        isRunning = false;
    }
};
