/**
 * TRON & Ethereum Vanity Address Generator - High Performance Worker
 * Uses @bitauth/libauth (WASM) for secp256k1 and keccak256 operations.
 */

// Import Libauth from esm.sh for WASM performance
import { 
    instantiateSecp256k1, 
    instantiateKeccak256,
    binToHex,
    hexToBin
} from 'https://esm.sh/@bitauth/libauth@2.0.0';

// Import TronWeb and Ethers for "Standard" (JS-only) mode
importScripts('https://cdn.jsdelivr.net/npm/tronweb/dist/TronWeb.js');
importScripts('https://cdn.jsdelivr.net/npm/ethers@6.13.4/dist/ethers.umd.min.js');

let isRunning = false;
let totalHashes = 0;
let lastReportTime = 0;
let hashesSinceLastReport = 0;

// WASM Instances
let secp256k1;
let keccak256;

/**
 * Initializes the WASM engines.
 */
async function initWasm() {
    if (!secp256k1) secp256k1 = await instantiateSecp256k1();
    if (!keccak256) keccak256 = await instantiateKeccak256();
}

/**
 * High speed address generation using WASM.
 */
function generateAddressWasm(network) {
    // Generate secure random private key
    const privateKeyBin = crypto.getRandomValues(new Uint8Array(32));
    const privateKeyHex = binToHex(privateKeyBin);

    // Derive uncompressed public key (65 bytes with 0x04 prefix)
    const publicKeyBin = secp256k1.derivePublicKeyUncompressed(privateKeyBin);
    
    // Remove the first byte (0x04 prefix) to get the raw 64 bytes
    const pubKeyRaw = publicKeyBin.slice(1);

    // Keccak-256 hash of the 64-byte public key
    const hash = keccak256.hash(pubKeyRaw);

    // Take the last 20 bytes
    const last20Bytes = hash.slice(-20);

    if (network === 'eth') {
        const address = '0x' + binToHex(last20Bytes);
        return { address, privateKey: '0x' + privateKeyHex };
    } else {
        // TRON Address: 0x41 prepend + Base58Check
        // We use TronWeb's utility for encoding if available, or implement manually
        // Since TronWeb is already imported via importScripts, we can use it.
        const addressHex = '41' + binToHex(last20Bytes);
        const addressBase58 = TronWeb.address.fromHex(addressHex);
        return { address: addressBase58, privateKey: privateKeyHex };
    }
}

/**
 * Standard address generation using JS-only libraries.
 */
function generateAddressStandard(network) {
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
async function loop(prefix, suffix, network, mode) {
    if (!isRunning) return;

    if (mode === 'fast') {
        await initWasm();
    }

    // Process in batches for UI responsiveness
    const batchSize = mode === 'fast' ? 500 : 100;

    for (let i = 0; i < batchSize; i++) {
        const { address, privateKey } = mode === 'fast' 
            ? generateAddressWasm(network) 
            : generateAddressStandard(network);
            
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
    setTimeout(() => loop(prefix, suffix, network, mode), 0);
}

onmessage = async function(e) {
    const { command, prefix, suffix, mode, network } = e.data;

    if (command === 'start') {
        isRunning = true;
        totalHashes = 0;
        lastReportTime = Date.now();
        hashesSinceLastReport = 0;
        loop(prefix, suffix, network, mode);
    } else if (command === 'stop') {
        isRunning = false;
    }
};
