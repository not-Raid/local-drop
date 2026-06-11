const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// Serve frontend static files
app.use(express.static('public'));

const port = process.env.PORT || 3000;

// Store active users: socket.id -> { id, name, mode, code?, pairedWith? }
const activeNodes = new Map();

io.on('connection', (socket) => {
    console.log('[+] Client connected:', socket.id);

    // Initial node registration
    socket.on('register-node', ({ mode, name }) => {
        let nodeData = { mode, name, id: socket.id, pairedWith: null };
        activeNodes.set(socket.id, nodeData);
        console.log(`Node registered: [${mode}] ${name} - ID: ${socket.id}`);
        socket.emit('node-registered', nodeData);
    });

    // Sender requests a code after files are selected
    socket.on('ready-to-send', () => {
        const nodeData = activeNodes.get(socket.id);
        if (nodeData && nodeData.mode === 'send') {
            const code = Math.floor(10000000 + Math.random() * 90000000).toString();
            nodeData.code = code;
            console.log(`[Send Ready] ID: ${socket.id} generated 8-digit Code: ${code}`);
            socket.emit('code-generated', code);
        }
    });

    // Receiver entering a one-time code to connect to a sender
    socket.on('connect-via-code', (code) => {
        const sender = Array.from(activeNodes.values()).find(n => n.mode === 'send' && n.code === code);
        
        if (sender) {
            console.log(`[Code] Client ${socket.id} connecting to Sender ${sender.id}`);
            
            // Pair them up
            const receiverNode = activeNodes.get(socket.id);
            if (receiverNode) receiverNode.pairedWith = sender.id;
            sender.pairedWith = socket.id;

            // Tell the sender that a receiver is trying to connect
            io.to(sender.id).emit('incoming-connection', {
                from: socket.id,
                name: receiverNode?.name || 'Unknown'
            });
            // Tell the receiver the connection was successful
            socket.emit('code-success', sender.id);
        } else {
            console.log(`[Code Error] Client ${socket.id} provided invalid code: ${code}`);
            socket.emit('code-error', 'Invalid or expired code.');
        }
    });

    // ============================================
    // Direct WebSocket File Relay
    // ============================================
    socket.on('file-meta', ({ target, meta }) => {
        io.to(target).emit('file-meta', { sender: socket.id, meta });
    });

    socket.on('file-chunk', ({ target, chunk }) => {
        io.to(target).emit('file-chunk', { sender: socket.id, chunk });
    });

    socket.on('transfer-complete', ({ target }) => {
        io.to(target).emit('transfer-complete', { sender: socket.id });
    });

    socket.on('cancel-transfer', () => {
        const node = activeNodes.get(socket.id);
        if (node && node.pairedWith) {
            console.log(`[Cancel] Client ${socket.id} cancelled transfer with ${node.pairedWith}`);
            io.to(node.pairedWith).emit('transfer-cancelled');
            
            const peer = activeNodes.get(node.pairedWith);
            if (peer) peer.pairedWith = null; // Unpair the remaining peer
            node.pairedWith = null;
        }
    });

    // Disconnect cleanup
    socket.on('disconnect', () => {
        console.log('[-] Client disconnected:', socket.id);
        const node = activeNodes.get(socket.id);
        
        if (node && node.pairedWith) {
            console.log(`[Disconnect] Notifying paired peer ${node.pairedWith}`);
            io.to(node.pairedWith).emit('peer-disconnected');
            
            const peer = activeNodes.get(node.pairedWith);
            if (peer) peer.pairedWith = null; // Unpair the remaining peer
        }
        
        activeNodes.delete(socket.id);
    });
});

// Use 0.0.0.0 to listen on all interfaces
server.listen(port, '0.0.0.0', () => {
    console.log(`===========================================`);
    console.log(`LocalDrop Server running!`);
    console.log(`Access on PC: http://localhost:${port}`);
    console.log(`Access on other devices via this PC's Local IP address (e.g., http://192.168.1.X:${port})`);
    console.log(`===========================================`);
});
