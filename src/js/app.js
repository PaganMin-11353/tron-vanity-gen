/**
 * TRON Vanity Address Generator - UI Logic
 * Handles user interactions, validation, and worker management.
 */

// DOM Elements
const prefixInput = document.getElementById('prefix');
const suffixInput = document.getElementById('suffix');
const prefixError = document.getElementById('prefix-error');
const suffixError = document.getElementById('suffix-error');
const resultLimitInput = document.getElementById('limit');
const modeStandard = document.getElementById('mode-standard');
const modeFast = document.getElementById('mode-fast');
const labelStandard = document.querySelector('label[for="mode-standard"]');
const labelFast = document.querySelector('label[for="mode-fast"]');
const switchTron = document.getElementById('switch-tron');
const switchEth = document.getElementById('switch-eth');
const btnStart = document.getElementById('btn-start');
const btnStop = document.getElementById('btn-stop');
const resultsBody = document.getElementById('results-body');
const warningBox = document.getElementById('security-warning');
const closeWarningBtn = document.getElementById('close-warning');

// Network State
let currentNetwork = 'tron';

const HEX_ALPHABET = '0123456789abcdefABCDEF';
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

// Stats Elements
const statSpeed = document.getElementById('stat-speed');
const statTotal = document.getElementById('stat-total');
const statProb = document.getElementById('stat-prob');
const statEta = document.getElementById('stat-eta');
const statMem = document.getElementById('stat-mem');
const statElapsed = document.getElementById('stat-elapsed');
const statCpu = document.getElementById('stat-cpu');
const progressBar = document.getElementById('progress-bar');

// Resource tracking state
let worker = null;
let startTime = 0;
let totalHashes = 0;
let foundCount = 0;
let resourceInterval = null;

// Speed tracking for ETA calculation
const modeSpeeds = {
    standard: 50, // Default H/s for TronWeb
    fast: 500     // Default H/s for WASM (Estimated)
};

/**
 * Validates current terminal network constraints.
 */
function validateInput(text, isPrefix = false) {
    if (text.length === 0) return { valid: true };

    if (currentNetwork === 'eth') {
        for (let char of text) {
            if (!HEX_ALPHABET.includes(char)) {
                return { valid: false, error: `Invalid Hex char: ${char}` };
            }
        }
    } else {
        for (let char of text) {
            if (!BASE58_ALPHABET.includes(char)) {
                return { valid: false, error: `Invalid Base58 char: ${char}` };
            }
        }
        if (isPrefix) {
            const secondChar = text[0];
            if (secondChar >= 'a' && secondChar <= 'z') {
                return { valid: false, error: "Second char cannot be lowercase [a-z]." };
            }
        }
    }

    return { valid: true };
}

/**
 * Handles network switching UI and state.
 */
function switchNetwork(network) {
    if (worker) stopGeneration();
    
    currentNetwork = network;
    document.body.className = network === 'eth' ? 'eth-theme' : 'tron-theme';
    
    switchTron.classList.toggle('active', network === 'tron');
    switchEth.classList.toggle('active', network === 'eth');
    
    // Update labels
    const name = network === 'eth' ? 'Ethereum' : 'TRON';
    document.getElementById('main-title').textContent = `${name} Vanity Generator`;
    document.title = `${name} Vanity - Local & Secure`;
    document.getElementById('meta-desc').setAttribute('content', `Generate ${name} vanity addresses locally in your browser.`);
    document.getElementById('security-text').textContent = `For maximum security, generate your ${name} vanity address offline by disconnecting from the internet.`;
    document.getElementById('prefix-label').textContent = `Prefix (Starts with ${network === 'eth' ? '0x' : 'T'})`;
    
    document.querySelector('.prefix-fixed').textContent = network === 'eth' ? '0x' : 'T';
    
    // Clear inputs and errors
    prefixInput.value = '';
    suffixInput.value = '';
    prefixError.textContent = '';
    suffixError.textContent = '';

    // Update engine labels
    if (network === 'eth') {
        labelStandard.textContent = 'Ethers.js (Stable)';
        labelFast.style.display = 'none';
        modeFast.style.display = 'none';
        modeStandard.checked = true;
    } else {
        labelStandard.textContent = 'TronWeb (Stable)';
        labelFast.style.display = 'block';
        modeFast.style.display = 'none'; // Keep hidden as per CSS
    }

    updateLiveETA();
}

switchTron.addEventListener('click', () => switchNetwork('tron'));
switchEth.addEventListener('click', () => switchNetwork('eth'));

/**
 * Calculates current probability and updates ETA display.
 */
function updateLiveETA() {
    const prefix = prefixInput.value.trim();
    const suffix = suffixInput.value.trim();
    const mode = modeStandard.checked ? 'standard' : 'fast';
    
    const probability = calculateProbability(prefix, suffix);
    const speed = modeSpeeds[mode];

    if (probability > 0 && probability < 1) {
        const etaSeconds = Math.floor((1 / probability) / speed);
        statEta.textContent = formatTime(etaSeconds);
    } else {
        statEta.textContent = '---';
    }
}

// Inline validation and live ETA listeners
prefixInput.addEventListener('input', () => {
    const val = validateInput(prefixInput.value, true);
    prefixError.textContent = val.valid ? '' : val.error;
    updateLiveETA();
});

suffixInput.addEventListener('input', () => {
    const val = validateInput(suffixInput.value, false);
    suffixError.textContent = val.valid ? '' : val.error;
    updateLiveETA();
});

document.getElementsByName('engine').forEach(el => {
    el.addEventListener('change', updateLiveETA);
});

// Dismissible warning
closeWarningBtn.addEventListener('click', () => {
    warningBox.style.display = 'none';
});

/**
 * Calculates the probability of finding the address and updates UI.
 */
function calculateProbability(prefix, suffix) {
    const combinedLength = prefix.length + suffix.length;
    if (combinedLength === 0) {
        statProb.textContent = '---';
        return 1;
    }

    const base = currentNetwork === 'eth' ? 16 : 58;
    const attempts = Math.pow(base, combinedLength);
    
    let probText = '';
    if (attempts < 1000) {
        probText = `1 in ${Math.round(attempts)}`;
    } else if (attempts < 1000000) {
        probText = `1 in ${(attempts / 1000).toFixed(1)}k`;
    } else if (attempts < 1000000000) {
        probText = `1 in ${(attempts / 1000000).toFixed(1)}M`;
    } else if (attempts < 1000000000000) {
        probText = `1 in ${(attempts / 1000000000).toFixed(1)}B`;
    } else {
        probText = `1 in ${(attempts / 1000000000000).toFixed(1)}T`;
    }

    statProb.textContent = probText;
    return 1 / attempts;
}

/**
 * Updates the stats UI and resource usage.
 */
function updateStats(hashesPerSecond, total) {
    const elapsed = Math.max(0, Math.floor((Date.now() - startTime) / 1000));
    statElapsed.textContent = `${elapsed}s`;

    totalHashes = total;
    statTotal.textContent = totalHashes.toLocaleString();
    statSpeed.textContent = `${hashesPerSecond.toLocaleString()} H/s`;

    const prefix = prefixInput.value.trim();
    const suffix = suffixInput.value.trim();
    const mode = modeStandard.checked ? 'standard' : 'fast';
    
    // Update learned mode speed
    if (hashesPerSecond > 0) {
        modeSpeeds[mode] = hashesPerSecond;
    }

    const probability = calculateProbability(prefix, suffix);

    if (hashesPerSecond > 0 && probability > 0) {
        const etaSeconds = Math.floor((1 / probability) / hashesPerSecond);
        statEta.textContent = formatTime(etaSeconds);
        
        const expected = 1 / probability;
        const progress = Math.min(100, (totalHashes / expected) * 100);
        progressBar.style.width = `${progress}%`;
    }

    // Update Resources
    if (navigator.hardwareConcurrency) {
        const status = (worker === null) ? 'Idle' : 'Running';
        statCpu.textContent = `${navigator.hardwareConcurrency} Cores (${status})`;
    }

    if (performance && performance.memory) {
        const usedMem = Math.round(performance.memory.usedJSHeapSize / 1024 / 1024);
        const limit = performance.memory.jsHeapLimit;
        if (limit) {
            const totalMem = Math.round(limit / 1024 / 1024);
            statMem.textContent = `${usedMem}MB / ${totalMem}MB`;
        } else {
            statMem.textContent = `${usedMem}MB`;
        }
    } else {
        statMem.textContent = 'N/A';
    }
}

function formatTime(seconds) {
    if (seconds === Infinity || isNaN(seconds)) return '---';
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
    return `${Math.floor(seconds / 86400)}d ${Math.floor((seconds % 86400) / 3600)}h`;
}

/**
 * Starts the generation process.
 */
function startGeneration() {
    const prefix = prefixInput.value.trim();
    const suffix = suffixInput.value.trim();
    const mode = modeStandard.checked ? 'standard' : 'fast';

    const pVal = validateInput(prefix, true);
    const sVal = validateInput(suffix, false);

    if (!pVal.valid || !sVal.valid) return;

    // Disable configuration
    prefixInput.disabled = true;
    suffixInput.disabled = true;
    resultLimitInput.disabled = true;
    document.getElementsByName('engine').forEach(el => el.disabled = true);

    // Reset UI
    resultsBody.innerHTML = '';
    totalHashes = 0;
    foundCount = 0;
    startTime = Date.now();
    btnStart.disabled = true;
    btnStop.disabled = false;
    statCpu.textContent = 'Running';
    progressBar.style.width = '0%';

    if (worker) worker.terminate();
    // Worker path is relative to the HTML file (index.html at root)
    worker = new Worker('src/js/worker.js');

    worker.onmessage = (e) => {
        const { type, data } = e.data;
        if (type === 'stats') {
            updateStats(data.hashesPerSecond, data.totalHashes);
        } else if (type === 'found') {
            foundCount++;
            addResult(data.address, data.privateKey);
            
            const limit = parseInt(resultLimitInput.value);
            if (foundCount >= limit) {
                stopGeneration();
                statCpu.textContent = 'Finished';
            }
        }
    };

    worker.postMessage({ command: 'start', prefix, suffix, mode, network: currentNetwork });
}

function stopGeneration() {
    if (worker) {
        worker.terminate();
        worker = null;
    }

    // Re-enable configuration
    prefixInput.disabled = false;
    suffixInput.disabled = false;
    resultLimitInput.disabled = false;
    document.getElementsByName('engine').forEach(el => el.disabled = false);

    btnStart.disabled = false;
    btnStop.disabled = true;
    statCpu.textContent = 'Stopped';
    statSpeed.textContent = '0 H/s';
    updateLiveETA(); // Re-show ETA based on historical speed
    progressBar.style.width = '0%';
}

function addResult(address, privateKey) {
    const prefix = prefixInput.value.trim();
    const suffix = suffixInput.value.trim();
    
    let highlightedAddress = address;

    // Highlight suffix first because it's at the end
    if (suffix) {
        const start = address.length - suffix.length;
        highlightedAddress = address.substring(0, start) + 
                             `<span class="highlight">${address.substring(start)}</span>`;
    }

    // Highlight prefix
    if (prefix) {
        const offset = currentNetwork === 'eth' ? 2 : 1;
        const prefixEnd = offset + prefix.length;
        const middlePart = highlightedAddress.substring(prefixEnd);
        highlightedAddress = highlightedAddress.substring(0, offset) + 
                             `<span class="highlight">${highlightedAddress.substring(offset, prefixEnd)}</span>` + 
                             middlePart;
    }

    const row = document.createElement('tr');
    row.innerHTML = `
        <td>${highlightedAddress}</td>
        <td><span class="pk-blur">${privateKey}</span></td>
        <td><button class="copy-btn" onclick="copyToClipboard('${privateKey}')">Copy Key</button></td>
    `;
    resultsBody.appendChild(row);
}

window.copyToClipboard = (text) => {
    navigator.clipboard.writeText(text).then(() => {
        alert('Copied Key');
    });
};

btnStart.addEventListener('click', startGeneration);
btnStop.addEventListener('click', stopGeneration);

// Resource tracking interval (runs even when stopped)
setInterval(() => {
    if (performance && performance.memory) {
        const usedMem = Math.round(performance.memory.usedJSHeapSize / 1024 / 1024);
        const limit = performance.memory.jsHeapLimit;
        if (limit) {
            const totalMem = Math.round(limit / 1024 / 1024);
            statMem.textContent = `${usedMem}MB / ${totalMem}MB`;
        } else {
            statMem.textContent = `${usedMem}MB`;
        }
    }
}, 2000);
