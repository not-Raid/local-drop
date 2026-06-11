# 🚀 LocalDrop: Secure & Encrypted File Transfer

LocalDrop is a blazing fast, secure, and fully encrypted file transfer application. Built with Node.js, Express, and Socket.io, it allows two clients to securely transfer files directly over WebSockets without any intermediaries saving the data.

## ✨ Key Features

- **Math-Based Encryption Engine**: Files are mathematically scrambled directly in the browser before they are ever sent over the network, ensuring complete privacy.
- **Hidden Node Discovery**: For enhanced security, devices do not broadcast their presence. Connections are strictly 1-to-1.
- **8-Digit Secure Codes**: Senders generate a secure, one-time 8-digit connection code that receivers use to establish a direct tunnel.
- **Strict Disconnect Protocol**: If either the sender or receiver loses connection or closes their tab, the session instantly self-destructs and the other party is forcefully disconnected, clearing all buffered data.
- **Lightning Fast Chunking**: Files are broken down into 64KB chunks to prevent memory crashes and ensure fast transfer speeds for massive files.

---

## 🔒 How the Encryption Works

The encryption happens completely client-side in the browser:

1. **The Formula**: When a sender selects a file, the system generates 6 random integers ($a, b, c, d, e, f$). It calculates an encryption seed using a complex integer formula:
   ```javascript
   N = (((a * c) % d) << 4) ^ (b * e) + (Math.pow(f, 2) % a)
   ```
2. **Scrambling the Chunks**: As the file is read, every single byte of data is passed through a mutating **XOR cipher**. The cipher uses the seed $N$ and the specific chunk index to completely scramble the data. 
3. **The Transfer**: The 6 variables ($a, b, c, d, e, f$) are sent to the receiver in the initial handshake. The actual encrypted file chunks are sent over the WebSocket. If intercepted, the data is entirely unreadable garbage.
4. **Reassembly**: The receiver takes the 6 variables, locally computes the identical key $N$, and runs the received chunks in reverse through the cipher to perfectly un-scramble the file before downloading it.

---

## 💻 Local Development

Want to run this locally on your own machine?

1. **Install dependencies:**
   ```bash
   npm install
   ```
2. **Start the server:**
   ```bash
   npm start
   ```
3. Open your browser and go to `http://localhost:3000`

---

## ☁️ How to Deploy Updates (Render)

This application is configured to deploy automatically via **Render** directly from this GitHub repository. 

Whenever you make changes to the code, simply push them to GitHub and Render will automatically detect the push and update the live site.

**Deployment Steps:**
1. Open your terminal in the project folder.
2. Stage all your new changes:
   ```bash
   git add .
   ```
3. Commit your changes with a descriptive message:
   ```bash
   git commit -m "describe what you updated here"
   ```
4. Push to GitHub:
   ```bash
   git push origin main
   ```
5. *Wait ~2-3 minutes*. Render will automatically fetch your new commit, build the app, and update the live site! You can monitor the progress in your Render Dashboard.
