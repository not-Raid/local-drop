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
    if (data.mode === 'send') {
        appState.code = data.code;
        sendCodeEl.innerText = data.code.split('').join(' ');
    }
});

// Update the list of available computers/devices for discovery
socket.on('nodes-update', (nodes) => {
    // For Send Mode: Show Receivers
    if (appState.mode === 'send') {
        const receivers = nodes.filter(n => n.mode === 'receive' && n.id !== socket.id);
        availableReceiversEl.innerHTML = '';
        if (receivers.length === 0) {
            availableReceiversEl.innerHTML = '<div class="empty-state">No receivers found...</div>';
        } else {
            receivers.forEach(r => {
                const div = document.createElement('div');
                div.className = 'node-item';
                div.innerHTML = `<i class="ri-smartphone-line node-icon"></i> <div><strong>${r.name}</strong><br><small>Ready to receive</small></div>`;
                div.onclick = () => {
                    socket.emit('connect-to-node', r.id);
                    appState.targetId = r.id;
                    startSending();
                };
                availableReceiversEl.appendChild(div);
            });
        }
    }
    
    // For Receive Mode: Show Senders
    if (appState.mode === 'receive') {
        const senders = nodes.filter(n => n.mode === 'send' && n.id !== socket.id);
        availableSendersEl.innerHTML = '';
        if (senders.length === 0) {
            availableSendersEl.innerHTML = '<div class="empty-state">Scanning local network...</div>';
        } else {
            senders.forEach(s => {
                const div = document.createElement('div');
                div.className = 'node-item';
                div.innerHTML = `<i class="ri-upload-cloud-2-line node-icon"></i> <div><strong>${s.name}</strong><br><small>Code: ${s.code}</small></div>`;
                div.onclick = () => {
                    socket.emit('connect-via-code', s.code);
                };
                availableSendersEl.appendChild(div);
            });
        }
    }
});

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
    if (code.length === 6) {
        socket.emit('connect-via-code', code);
    } else {
        document.getElementById('code-error').innerText = "Enter the 6-digit code";
    }
};

// File Selection
fileInput.addEventListener('change', (e) => {
    appState.files = Array.from(e.target.files);
    fileCountLabel.innerText = `${appState.files.length} file(s) selected`;
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

function sendFile(file) {
    return new Promise((resolve) => {
        // 1. Send File Meta
        socket.emit('file-meta', {
            target: appState.targetId,
            meta: { name: file.name, size: file.size, type: file.type }
        });

        // 2. Read and Send Chunks
        let offset = 0;
        const reader = new FileReader();

        reader.onload = async (e) => {
            socket.emit('file-chunk', {
                target: appState.targetId,
                chunk: e.target.result
            });
            
            offset += e.target.result.byteLength;
            const percent = Math.floor((offset / file.size) * 100);
            sendProgress.style.width = `${percent}%`;
            sendProgressText.innerText = `${percent}%`;

            if (offset < file.size) {
                // Yield to the main thread to prevent UI freezing and allow the progress bar to animate smoothly
                await new Promise(r => setTimeout(r, 0));
                readNextChunk();
            } else {
                // Done
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

socket.on('file-meta', (data) => {
    incomingMeta = data.meta;
    receiveBuffer = [];
    bytesReceived = 0;
    receiveTransferBox.style.display = 'block';
    currentFileName.innerText = `Receiving: ${incomingMeta.name}`;
    receiveProgress.style.width = "0%";
    receiveProgressText.innerText = "0%";
});

socket.on('file-chunk', (data) => {
    receiveBuffer.push(data.chunk);
    bytesReceived += data.chunk.byteLength;
    
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
