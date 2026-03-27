const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// Serve frontend static files
app.use(express.static('public'));

const port = process.env.PORT || 3000;

// Store active users: socket.id -> { id, name, mode, code? }
const activeNodes = new Map();

io.on('connection', (socket) => {
    console.log('[+] Client connected:', socket.id);

    // Initial node registration
    socket.on('register-node', ({ mode, name }) => {
        let nodeData = { mode, name, id: socket.id };
        
        // If Send mode, generate a unique 6-digit code for receivers to connect
        if (mode === 'send') {
            const code = Math.floor(100000 + Math.random() * 900000).toString();
            nodeData.code = code;
        }
        
        activeNodes.set(socket.id, nodeData);
        console.log(`Node registered: [${mode}] ${name} - ID: ${socket.id} Code: ${nodeData.code || 'N/A'}`);

        // Confirm registration to client
        socket.emit('node-registered', nodeData);
        broadcastNodes();
    });

    // Helper to broadcast list of all nodes to everyone for discovery
    const broadcastNodes = () => {
        const nodes = Array.from(activeNodes.values());
        io.emit('nodes-update', nodes);
    };

    // Receiver entering a one-time code to connect to a sender
    socket.on('connect-via-code', (code) => {
        const sender = Array.from(activeNodes.values()).find(n => n.mode === 'send' && n.code === code);
        
        if (sender) {
            console.log(`[Code] Client ${socket.id} connecting to Sender ${sender.id}`);
            // Tell the sender that a receiver is trying to connect
            io.to(sender.id).emit('incoming-connection', {
                from: socket.id,
                name: activeNodes.get(socket.id)?.name || 'Unknown'
            });
            // Tell the receiver the connection was successful
            socket.emit('code-success', sender.id);
        } else {
            console.log(`[Code Error] Client ${socket.id} provided invalid code: ${code}`);
            socket.emit('code-error', 'Invalid or expired code.');
        }
    });

    // Sender explicitly clicking a receiver from the discovery list
    socket.on('connect-to-node', (targetId) => {
        console.log(`[Discovery] Sender ${socket.id} connecting to Receiver ${targetId}`);
        io.to(targetId).emit('incoming-connection', {
            from: socket.id,
            name: activeNodes.get(socket.id)?.name || 'Unknown'
        });
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

    // Disconnect cleanup
    socket.on('disconnect', () => {
        console.log('[-] Client disconnected:', socket.id);
        activeNodes.delete(socket.id);
        broadcastNodes();
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
