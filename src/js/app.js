/**
 * TRON Vanity Address Generator - UI Logic
 * Handles user interactions, validation, and multi-core worker management.
 */

// DOM Elements
const prefixInput = document.getElementById('prefix');
const suffixInput = document.getElementById('suffix');
const prefixError = document.getElementById('prefix-error');
const suffixError = document.getElementById('suffix-error');
const resultLimitInput = document.getElementById('limit');
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

// Multi-core worker management
let workers = [];
let workerStats = {}; // Per-worker stats: { workerId: { totalHashes, hashesPerSecond } }
let startTime = 0;
let foundCount = 0;
let hasShownError = false; // Prevent multiple error alerts

// Speed tracking for ETA calculation
let currentSpeed = 100; // H/s estimate, updated from actual performance

// Get optimal worker count (leave 1 core for UI, minimum 1 worker)
function getWorkerCount() {
    const cores = navigator.hardwareConcurrency || 4;
    // return Math.max(1, cores - 1);
    return Math.max(1, cores);

}

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
    if (workers.length > 0) stopGeneration();

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

    const probability = calculateProbability(prefix, suffix);

    if (probability > 0 && probability < 1) {
        const etaSeconds = Math.floor((1 / probability) / currentSpeed);
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


// Dismissible warning
closeWarningBtn.addEventListener('click', () => {
    warningBox.style.display = 'none';
});

/**
 * Calculates the probability of finding the address and updates UI.
 *
 * For TRON (Base58Check):
 * - 2nd char (1st prefix char): ~33 possible (uppercase + digits in Base58)
 * - 3rd+ chars: 58 possible (full Base58 alphabet)
 *
 * For Ethereum (hex, case-insensitive): 16 possible per char
 */
function calculateProbability(prefix, suffix) {
    const combinedLength = prefix.length + suffix.length;
    if (combinedLength === 0) {
        statProb.textContent = '---';
        return 1;
    }

    let attempts;
    if (currentNetwork === 'eth') {
        // Ethereum: 16 hex chars, case-insensitive
        attempts = Math.pow(16, combinedLength);
    } else {
        // TRON Base58Check: position-dependent probability
        // 2nd char of address (1st prefix char): ~33 possible (A-Z excluding I,O + 1-9)
        // Subsequent chars: 58 possible (full Base58)
        attempts = 1;

        // Calculate prefix probability
        for (let i = 0; i < prefix.length; i++) {
            if (i === 0) {
                // First prefix char = 2nd address char: restricted to uppercase + digits
                attempts *= 33;
            } else {
                attempts *= 58;
            }
        }

        // Calculate suffix probability (all positions use full Base58)
        attempts *= Math.pow(58, suffix.length);
    }

    const probText = formatProbability(attempts);
    statProb.textContent = probText;
    return 1 / attempts;
}

function formatProbability(attempts) {
    if (attempts < 1000) {
        return `1 in ${Math.round(attempts)}`;
    } else if (attempts < 1000000) {
        return `1 in ${(attempts / 1000).toFixed(1)}k`;
    } else if (attempts < 1000000000) {
        return `1 in ${(attempts / 1000000).toFixed(1)}M`;
    } else if (attempts < 1000000000000) {
        return `1 in ${(attempts / 1000000000).toFixed(1)}B`;
    } else {
        return `1 in ${(attempts / 1000000000000).toFixed(1)}T`;
    }
}

/**
 * Aggregates stats from all workers and updates UI.
 */
function updateAggregatedStats() {
    let totalHashesAll = 0;
    let totalSpeedAll = 0;

    for (const id in workerStats) {
        totalHashesAll += workerStats[id].totalHashes || 0;
        totalSpeedAll += workerStats[id].hashesPerSecond || 0;
    }

    const elapsed = Math.max(0, Math.floor((Date.now() - startTime) / 1000));
    statElapsed.textContent = `${elapsed}s`;

    statTotal.textContent = totalHashesAll.toLocaleString();
    statSpeed.textContent = `${totalSpeedAll.toLocaleString()} H/s`;

    const prefix = prefixInput.value.trim();
    const suffix = suffixInput.value.trim();

    // Update learned speed
    if (totalSpeedAll > 0) {
        currentSpeed = totalSpeedAll;
    }

    const probability = calculateProbability(prefix, suffix);

    if (totalSpeedAll > 0 && probability > 0) {
        const etaSeconds = Math.floor((1 / probability) / totalSpeedAll);
        statEta.textContent = formatTime(etaSeconds);

        const expected = 1 / probability;
        const progress = Math.min(100, (totalHashesAll / expected) * 100);
        progressBar.style.width = `${progress}%`;
    }

    // Update Resources
    const workerCount = workers.length;
    const cores = navigator.hardwareConcurrency || '?';
    if (workerCount > 0) {
        statCpu.textContent = `${workerCount}/${cores} Cores`;
    } else {
        statCpu.textContent = `${cores} Cores (Idle)`;
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
 * Gets the validated result limit.
 */
function getResultLimit() {
    const value = parseInt(resultLimitInput.value, 10);
    if (isNaN(value) || value < 1) return 1;
    if (value > 100) return 100;
    return value;
}

/**
 * Creates a worker and sets up message handling.
 */
function createWorker(workerId, prefix, suffix, network) {
    const worker = new Worker('src/js/worker.js');

    workerStats[workerId] = { totalHashes: 0, hashesPerSecond: 0 };

    worker.onmessage = (e) => {
        const { type, data } = e.data;

        if (type === 'stats') {
            workerStats[workerId] = {
                totalHashes: data.totalHashes,
                hashesPerSecond: data.hashesPerSecond
            };
            updateAggregatedStats();
        } else if (type === 'found') {
            // Check limit BEFORE incrementing to prevent race condition
            const limit = getResultLimit();
            if (foundCount >= limit) {
                return; // Already at limit, ignore this result
            }

            foundCount++;
            addResult(data.address, data.privateKey);

            if (foundCount >= limit) {
                stopGeneration();
                statCpu.textContent = 'Finished';
            }
        } else if (type === 'error') {
            console.error(`Worker ${workerId} error:`, data.message);
            if (!hasShownError) {
                hasShownError = true;
                stopGeneration();
                alert(`Worker error: ${data.message}\n\nPlease check your internet connection and try again.`);
            }
        }
    };

    worker.onerror = (err) => {
        console.error(`Worker ${workerId} error:`, err);
        if (!hasShownError) {
            hasShownError = true;
            stopGeneration();
            alert('Worker failed to start. Please check your internet connection and try again.');
        }
    };

    worker.postMessage({ command: 'start', prefix, suffix, network });

    return worker;
}

/**
 * Starts the generation process with multiple workers.
 */
function startGeneration() {
    const prefix = prefixInput.value.trim();
    const suffix = suffixInput.value.trim();

    const pVal = validateInput(prefix, true);
    const sVal = validateInput(suffix, false);

    if (!pVal.valid || !sVal.valid) return;

    // Disable configuration
    prefixInput.disabled = true;
    suffixInput.disabled = true;
    resultLimitInput.disabled = true;

    // Reset UI and state
    resultsBody.innerHTML = '';
    foundCount = 0;
    hasShownError = false;
    startTime = Date.now();
    btnStart.disabled = true;
    btnStop.disabled = false;
    progressBar.style.width = '0%';

    // Stop any existing workers
    stopWorkers();

    // Spawn workers based on available cores
    const workerCount = getWorkerCount();
    workerStats = {};

    for (let i = 0; i < workerCount; i++) {
        const worker = createWorker(i, prefix, suffix, currentNetwork);
        workers.push(worker);
    }

    statCpu.textContent = `${workerCount}/${navigator.hardwareConcurrency || '?'} Cores`;
}

/**
 * Terminates all workers.
 */
function stopWorkers() {
    workers.forEach(worker => worker.terminate());
    workers = [];
    workerStats = {};
}

function stopGeneration() {
    stopWorkers();

    // Re-enable configuration
    prefixInput.disabled = false;
    suffixInput.disabled = false;
    resultLimitInput.disabled = false;

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
    const offset = currentNetwork === 'eth' ? 2 : 1;

    // Build highlighted address using DOM elements (safe from XSS)
    const addressCell = document.createElement('td');

    // Calculate highlight ranges (on original address, not modified HTML)
    const prefixStart = offset;
    const prefixEnd = offset + prefix.length;
    const suffixStart = address.length - suffix.length;

    // Split address into parts and create spans
    let currentPos = 0;
    const parts = [];

    // Part before prefix
    if (prefix && prefixStart > currentPos) {
        parts.push({ text: address.substring(currentPos, prefixStart), highlight: false });
        currentPos = prefixStart;
    }

    // Prefix part
    if (prefix) {
        parts.push({ text: address.substring(prefixStart, prefixEnd), highlight: true });
        currentPos = prefixEnd;
    }

    // Middle part (between prefix and suffix, or from start if no prefix)
    if (suffix && suffixStart > currentPos) {
        parts.push({ text: address.substring(currentPos, suffixStart), highlight: false });
        currentPos = suffixStart;
    } else if (!suffix && currentPos < address.length) {
        parts.push({ text: address.substring(currentPos), highlight: false });
        currentPos = address.length;
    }

    // Suffix part
    if (suffix) {
        parts.push({ text: address.substring(suffixStart), highlight: true });
    }

    // Handle case with no prefix/suffix
    if (parts.length === 0) {
        parts.push({ text: address, highlight: false });
    }

    // Build address cell with proper DOM elements
    parts.forEach(part => {
        if (part.highlight) {
            const span = document.createElement('span');
            span.className = 'highlight';
            span.textContent = part.text;
            addressCell.appendChild(span);
        } else {
            addressCell.appendChild(document.createTextNode(part.text));
        }
    });

    // Build private key cell
    const pkCell = document.createElement('td');
    const pkSpan = document.createElement('span');
    pkSpan.className = 'pk-blur';
    pkSpan.textContent = privateKey;
    pkCell.appendChild(pkSpan);

    // Build action cell with safe event listener
    const actionCell = document.createElement('td');
    const copyBtn = document.createElement('button');
    copyBtn.className = 'copy-btn';
    copyBtn.textContent = 'Copy Key';
    copyBtn.addEventListener('click', () => copyToClipboard(privateKey));
    actionCell.appendChild(copyBtn);

    // Assemble row
    const row = document.createElement('tr');
    row.appendChild(addressCell);
    row.appendChild(pkCell);
    row.appendChild(actionCell);
    resultsBody.appendChild(row);
}

function copyToClipboard(text) {
    if (!navigator.clipboard) {
        // Fallback for non-HTTPS or older browsers
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.opacity = '0';
        document.body.appendChild(textArea);
        textArea.select();
        try {
            document.execCommand('copy');
            alert('Copied Key');
        } catch (err) {
            alert('Failed to copy. Please copy manually.');
        }
        document.body.removeChild(textArea);
        return;
    }

    navigator.clipboard.writeText(text)
        .then(() => alert('Copied Key'))
        .catch(() => alert('Failed to copy. Please copy manually.'));
}

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

    // Update core display on idle
    if (workers.length === 0) {
        const cores = navigator.hardwareConcurrency || '?';
        statCpu.textContent = `${cores} Cores (Idle)`;
    }
}, 2000);

// Initial core count display
const cores = navigator.hardwareConcurrency || '?';
statCpu.textContent = `${cores} Cores (Idle)`;
