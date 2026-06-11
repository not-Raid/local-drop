const socket = io();

// State
let appState = {
    mode: 'landing', // 'landing', 'send', 'receive'
    deviceName: `Node-${Math.floor(Math.random() * 1000)}`,
    code: null,
    targetId: null, // the socket.id of the person we are transferring with
    files: []
};

// UI Elements
const views = {
    landing: document.getElementById('view-landing'),
    send: document.getElementById('view-send'),
    receive: document.getElementById('view-receive')
};

const sendCodeEl = document.getElementById('sender-code');
const senderNameEl = document.getElementById('sender-name');
const receiverNameEl = document.getElementById('receiver-name');
const availableReceiversEl = document.getElementById('available-receivers');
const availableSendersEl = document.getElementById('available-senders');
const fileInput = document.getElementById('file-input');
const fileCountLabel = document.getElementById('file-count-label');
const codeInputs = document.querySelectorAll('.code-digit');

const sendTransferBox = document.getElementById('send-transfer-box');
const sendProgress = document.getElementById('send-progress');
const sendProgressText = document.getElementById('send-progress-text');
const sendTargetName = document.getElementById('send-target-name');

const receiveTransferBox = document.getElementById('receive-transfer-box');
const receiveProgress = document.getElementById('receive-progress');
const receiveProgressText = document.getElementById('receive-progress-text');
const receiveTargetName = document.getElementById('receive-target-name');
const currentFileName = document.getElementById('current-file-name');
const downloadList = document.getElementById('download-list');

const app = {
    setMode: (mode) => {
        appState.mode = mode;
        Object.values(views).forEach(v => v.classList.remove('active'));
        views[mode].classList.add('active');

        if (mode === 'send') {
            senderNameEl.innerText = appState.deviceName;
            socket.emit('register-node', { mode: 'send', name: appState.deviceName });
        } else if (mode === 'receive') {
            receiverNameEl.innerText = appState.deviceName;
            socket.emit('register-node', { mode: 'receive', name: appState.deviceName });
            codeInputs[0].focus();
        }
    }
};

// =====================================
// Socket Events
// =====================================

socket.on('node-registered', (data) => {
    console.log("Registered as:", data.mode);
});

socket.on('code-generated', (code) => {
    appState.code = code;
    sendCodeEl.innerText = code.split('').join(' ');
    document.getElementById('send-code-container').style.display = 'block';
});

socket.on('peer-disconnected', () => {
    alert("Connection lost. The other device disconnected.");
    window.location.reload();
});

socket.on('transfer-cancelled', () => {
    alert("Transfer was cancelled by the other device.");
    window.location.reload();
});

// Cancel Transfer Button Logic
function cancelTransfer() {
    if (confirm("Are you sure you want to cancel this transfer?")) {
        socket.emit('cancel-transfer');
        window.location.reload();
    }
}

// Receiver attempted to connect via code
socket.on('code-success', (senderId) => {
    appState.targetId = senderId;
    document.getElementById('code-error').innerText = '';
    receiveTargetName.innerText = "Sender";
    receiveTransferBox.style.display = 'block';
    currentFileName.innerText = "Connected! Waiting for files...";
});

socket.on('code-error', (msg) => {
    document.getElementById('code-error').innerText = msg;
});

// Sender is told a receiver connected
socket.on('incoming-connection', (data) => {
    appState.targetId = data.from;
    sendTargetName.innerText = data.name;
    startSending();
});

// =====================================
// Custom UI Interactions
// =====================================

// Auto jump code inputs
codeInputs.forEach((input, index) => {
    input.addEventListener('input', (e) => {
        if (e.target.value && index < codeInputs.length - 1) {
            codeInputs[index + 1].focus();
        }
    });
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !e.target.value && index > 0) {
            codeInputs[index - 1].focus();
        }
    });
});

// Connect Code Button
document.getElementById('connect-code-btn').onclick = () => {
    const code = Array.from(codeInputs).map(i => i.value).join('');
    if (code.length === 8) {
        socket.emit('connect-via-code', code);
    } else {
        document.getElementById('code-error').innerText = "Enter the 8-digit code";
    }
};

// File Selection
fileInput.addEventListener('change', (e) => {
    appState.files = Array.from(e.target.files);
    fileCountLabel.innerText = `${appState.files.length} file(s) selected`;
    
    // Once files are selected, tell server we are ready to send and get a code
    if (appState.files.length > 0) {
        socket.emit('ready-to-send');
    }
});

// =====================================
// File Transfer Logic (Chunked over Socket)
// =====================================

const CHUNK_SIZE = 64 * 1024; // 64KB
let currentFileIndex = 0;

function startSending() {
    if (!appState.targetId || appState.files.length === 0) {
        alert("Please select files first.");
        return;
    }
    sendTransferBox.style.display = 'block';
    currentFileIndex = 0;
    sendNextFile();
}

function sendNextFile() {
    if (currentFileIndex >= appState.files.length) {
        sendProgressText.innerText = "All files transferred!";
        sendTargetName.innerText = "Completed";
        return;
    }
    const file = appState.files[currentFileIndex];
    sendTargetName.innerText = `Receiver (${currentFileIndex + 1}/${appState.files.length})`;
    
    sendFile(file).then(() => {
        currentFileIndex++;
        // Small delay to let receiver DOM update cleanly
        setTimeout(sendNextFile, 500);
    });
}

// Math formula variables
let mathVars = null;
let currentKey = null;

function generateMathVars() {
    const rand = () => Math.floor(Math.random() * 9000) + 1000;
    mathVars = { a: rand(), b: rand(), c: rand(), d: rand(), e: rand(), f: rand() };
    currentKey = calculateEncryptionKey(mathVars);
}

function calculateEncryptionKey({a, b, c, d, e, f}) {
    let N = (((a * c) % d) << 4) ^ (b * e) + (Math.pow(f, 2) % a);
    return Math.abs(N);
}

function encryptDecryptChunk(arrayBuffer, key, chunkIndex) {
    const view = new Uint8Array(arrayBuffer);
    let k = key + chunkIndex;
    for (let i = 0; i < view.length; i++) {
        view[i] ^= (k & 0xFF);
        k = (k * 16807) % 2147483647;
    }
    return arrayBuffer;
}

function sendFile(file) {
    return new Promise((resolve) => {
        generateMathVars();

        // 1. Send File Meta with Math variables
        socket.emit('file-meta', {
            target: appState.targetId,
            meta: { name: file.name, size: file.size, type: file.type, mathVars: mathVars }
        });

        // 2. Read and Send Chunks
        let offset = 0;
        let chunkIndex = 0;
        const reader = new FileReader();

        reader.onload = async (e) => {
            // Encrypt the chunk before sending
            const encryptedBuffer = encryptDecryptChunk(e.target.result, currentKey, chunkIndex);

            socket.emit('file-chunk', {
                target: appState.targetId,
                chunk: encryptedBuffer
            });
            
            offset += encryptedBuffer.byteLength;
            chunkIndex++;
            const percent = Math.floor((offset / file.size) * 100);
            sendProgress.style.width = `${percent}%`;
            sendProgressText.innerText = `${percent}%`;

            if (offset < file.size) {
                await new Promise(r => setTimeout(r, 0));
                readNextChunk();
            } else {
                socket.emit('transfer-complete', { target: appState.targetId });
                resolve();
            }
        };

        function readNextChunk() {
            const slice = file.slice(offset, offset + CHUNK_SIZE);
            reader.readAsArrayBuffer(slice);
        }

        readNextChunk();
    });
}

// Receiver Logic
let receiveBuffer = [];
let incomingMeta = null;
let bytesReceived = 0;
let receiveKey = null;
let receiveChunkIndex = 0;

socket.on('file-meta', (data) => {
    incomingMeta = data.meta;
    receiveBuffer = [];
    bytesReceived = 0;
    receiveChunkIndex = 0;
    
    // Calculate decryption key using the math variables from sender
    receiveKey = calculateEncryptionKey(incomingMeta.mathVars);

    receiveTransferBox.style.display = 'block';
    currentFileName.innerText = `Receiving: ${incomingMeta.name}`;
    receiveProgress.style.width = "0%";
    receiveProgressText.innerText = "0%";
});

socket.on('file-chunk', (data) => {
    // Decrypt the chunk
    const decryptedBuffer = encryptDecryptChunk(data.chunk, receiveKey, receiveChunkIndex);
    receiveChunkIndex++;

    receiveBuffer.push(decryptedBuffer);
    bytesReceived += decryptedBuffer.byteLength;
    
    if (incomingMeta) {
        const percent = Math.floor((bytesReceived / incomingMeta.size) * 100);
        receiveProgress.style.width = `${percent}%`;
        receiveProgressText.innerText = `${percent}%`;
    }
});

socket.on('transfer-complete', () => {
    const blob = new Blob(receiveBuffer, { type: incomingMeta.type });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = incomingMeta.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    
    receiveProgressText.innerText = "Complete!";
    currentFileName.innerText = "File transfer complete.";
    
    // Add to list
    const div = document.createElement('div');
    div.className = "file-item";
    div.innerHTML = `<span><i class="ri-file-line"></i> ${incomingMeta.name}</span> <a href="${url}" download="${incomingMeta.name}"><i class="ri-download-line"></i></a>`;
    downloadList.appendChild(div);
    
    // Cleanup
    receiveBuffer = [];
});
