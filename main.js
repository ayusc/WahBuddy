//  WahBuddy - A simple whatsapp userbot written in pure js
//  Copyright (C) 2025-present Ayus Chatterjee
//
//  This program is free software: you can redistribute it and/or modify
//  it under the terms of the GNU General Public License as published by
//  the Free Software Foundation, either version 3 of the License, or
//  (at your option) any later version.

//  This program is distributed in the hope that it will be useful,
//  but WITHOUT ANY WARRANTY; without even the implied warranty of
//  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
//  GNU General Public License for more details.

//  You should have received a copy of the GNU General Public License
//  along with this program.  If not, see <https://www.gnu.org/licenses/>.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
} from 'baileys';
import { Boom } from '@hapi/boom';
import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
import pino from 'pino';
import { fetchLatestBaileysVersion } from 'baileys';
import express from "express";
import http from "http";
import qrcode from "qrcode";
import { Server } from "socket.io";
import app from './app.js';
import { handleAfkMessages } from './modules/afk.js';
import { startAutoBio } from './modules/autobio.js';
import { startAutoDP } from './modules/autodp.js';
import { startAutoName } from './modules/autoname.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
let autoDPStarted = false;
let autoBioStarted = false;
let autoNameStarted = false;
const autoDP = process.env.ALWAYS_AUTO_DP || 'False';
const autobio = process.env.ALWAYS_AUTO_BIO || 'False';
const autoname = process.env.ALWAYS_AUTO_NAME || 'False';
const mongoUri = process.env.MONGO_URI;
const SITE_URL = process.env.SITE_URL;
const authDir = './wahbuddy-auth';
const dbName = 'wahbuddy';
let db, sessionCollection, stagingsessionCollection;

const debounce = (fn, delay) => {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
};
      
const server = http.createServer(app);
const io = new Server(server);
let loggedIn = false;
let lastQR = null;     
let lastQrDataUrl = null;
let lastQrTimestamp = 0;  

io.on('connection', socket => {
  socket.on('request-code', async ({ phone }) => {
    try {
      const mongoClient = new MongoClient(mongoUri);
      db = mongoClient.db(dbName);
      sessionCollection = db.collection('wahbuddy_sessions');
      stagingsessionCollection = db.collection('wahbuddy_sessions_staging');

      const cleanPhone = phone.startsWith('+') ? phone.slice(1) : phone;

      fs.mkdirSync(authDir, { recursive: true });
      const { state, saveCreds } = await useMultiFileAuthState(authDir);
      const { version } = await fetchLatestBaileysVersion();

      const sock = makeWASocket({
        version,
        auth: state,
        browser: ['Wahbuddy', 'Safari', '1.0'],
        printQRInTerminal: false,
        defaultQueryTimeoutMs: undefined,
        logger: pino({ level: 'silent' }),
      });

      if (!state.creds.registered) {
        try {
          const code = await sock.requestPairingCode(cleanPhone);
          const formatted = code.match(/.{1,4}/g).join('-');
          socket.emit('pairing-code', formatted);
        } catch (err) {
          let msg = String(err);
          if (msg.includes("precondition required")) {
            msg = "WhatsApp rejected pairing (precondition required). Try restarting WhatsApp, ensure you're logged in, and retry in a few minutes.";
          }
          console.error('Failed to get pairing code:', err);
          socket.emit('pairing-error', msg);
          return;
        }
      }

      sock.ev.on('connection.update', ({ connection }) => {
        if (connection === 'open') {
          io.emit('login-success');
          startbot(sock); // <-- Call startbot after login
        }
      });

      sock.ev.on(
        'creds.update',
        debounce(async () => {
          await saveCreds();
          await saveAuthStateToMongo();
        }, 1000)
      );
    } catch (err) {
      let msg = String(err);
      if (msg.includes("precondition required")) {
        msg = "WhatsApp rejected pairing (precondition required). Try restarting WhatsApp, ensure you're logged in, and retry in a few minutes.";
      }
      console.error('Pairing code error:', err);
      socket.emit('pairing-error', msg);
    }
  });
});

app.get("/auth", (req, res) => {
  if (loggedIn) return res.status(404).send("Already logged in!");

  res.send(`
    <html>
      <head>
        <title>WahBuddy Login</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <script src="/socket.io/socket.io.js"></script>
        <script src="https://cdn.jsdelivr.net/npm/qrcodejs/qrcode.min.js"></script>
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/intl-tel-input@25.10.10/build/css/intlTelInput.css">
        <script src="https://cdn.jsdelivr.net/npm/intl-tel-input@25.10.10/build/js/intlTelInput.min.js"></script>
        <style>
          body {
            font-family: sans-serif;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            margin: 0;
            background: #e5ddd5;
          }
          .centered-header {
            display: flex;
            flex-direction: column;
            align-items: center;
            margin-bottom: 14px;
          }
          .logo-img {
            width: 80px;
            margin-bottom: 8px;
          }
          h1, h2 { color: #075e54; }
          .card, #qr-container, #phone-section, #code-section {
            background: #fff;
            width: 100%;
            max-width: 400px;
            margin: 10px auto;
            padding: 20px;
            border-radius: 12px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.1);
            box-sizing: border-box;
            text-align: center;
          }
          #qr {
            width: 100%;
            max-width: 300px;
            height: auto;
            display: block;
            margin: 0 auto;
          }
          button, #phone {
            width: 100%;
            max-width: 300px;
            font-size: 16px;
          }
          .iti {
            width: 100% !important;
            max-width: 300px;
            position: relative;
            display: block;
          }
          .iti__flag-container {
            left: 10px;
            position: absolute;
            z-index: 2;
          }
          #phone {
            padding-left: 80px !important;
            width: 100%;
            max-width: 300px;
            box-sizing: border-box;
            display: block;
          }
          .pairing-code {
            display: flex;
            justify-content: center;
            gap: 12px;
            margin-top: 16px;
            margin-bottom: 8px;
          }
          .pairing-char {
            font-size: 2.2em;
            font-weight: bold;
            border: 2px solid #075e54;
            border-radius: 8px;
            background: #e5ddd5;
            padding: 18px 12px;
            min-width: 38px;
            text-align: center;
            box-shadow: 0 2px 6px rgba(7,94,84,0.08);
            letter-spacing: 2px;
            transition: background .2s;
          }
          @media (max-width: 480px) {
            .card, #qr-container, #phone-section, #code-section {
              max-width: 98vw;
              padding: 5vw 2vw;
            }
            #qr, button, #phone {
              max-width: 95vw;
              font-size: 18px;
            }
            .pairing-char { font-size: 1.5em; padding: 12px 8px; min-width: 28px; }
          }
          @media (orientation: landscape) and (max-width: 900px) {
            .card, #qr-container, #phone-section, #code-section {
              max-width: 80vw;
              padding: 3vw 2vw;
            }
            #qr, button, #phone {
              max-width: 80vw;
              font-size: 16px;
            }
          }
        </style>
      </head>
      <body>
        <div class="centered-header">
          <img src="/wahbuddy-logo.png" class="logo-img" alt="WahBuddy Logo" onerror="this.style.display='none';">
          <h1 style="margin-bottom:0;">WahBuddy Login</h1>
        </div>
        <div id="qr-section">
          <p id="status">Waiting for QR...</p>
          <div id="qr-container">
            <img id="qr" src="" alt="WhatsApp QR Code" />
          </div>
          <button id="switch-to-phone">Login with phone number instead</button>
        </div>
        <div id="phone-section" style="display:none;">
          <h2>Enter your phone number</h2>
          <input id="phone" type="tel" placeholder="Phone number" />
          <div style="margin-top:10px;">
            <button id="send-code">Send Pairing Code</button>
          </div>
        </div>
        <div id="code-section" style="display:none;">
          <h2>Enter this code in your phone</h2>
          <div id="pairing-code" class="pairing-code"></div>
          <p>Please check your phone for a notification asking to enter the pairing code</p>
        </div>
        <script>
          const socket = io();
          const statusEl = document.getElementById("status");
          const qrImg = document.getElementById("qr");
          document.getElementById("switch-to-phone").onclick = () => {
            document.getElementById("qr-section").style.display = "none";
            document.getElementById("phone-section").style.display = "block";
            document.getElementById("phone").focus();
          };
          const phoneInput = document.querySelector("#phone");
          const iti = window.intlTelInput(phoneInput, {
            separateDialCode: true,
            preferredCountries: ["in", "us", "gb"],
            utilsScript: "https://cdn.jsdelivr.net/npm/intl-tel-input@25.10.10/build/js/utils.js"
          });
          document.getElementById("send-code").onclick = async () => {
            await iti.promise;
            let rawInput = phoneInput.value.trim().replace(/[\\s\\-()]/g, "");
            if (!/^\\d+$/.test(rawInput)) {
              alert("Please enter digits only (no letters or special characters).");
              return;
            }
            const e164 = iti.getNumber(); // includes '+'
            socket.emit("request-code", { phone: e164 });
            document.getElementById("phone-section").style.display = "none";
            document.getElementById("code-section").style.display = "block";
          };
          socket.on("qr", qrDataUrl => {
            qrImg.src = qrDataUrl;
            statusEl.textContent = "QR Code ready! Scan with WhatsApp.";
          });
          socket.on("qr-raw", qr => {
            new QRCode(document.getElementById("qr-container"), {
              text: qr, width: 300, height: 300,
              correctLevel: QRCode.CorrectLevel.L
            });
            statusEl.textContent = "QR Code ready! Scan with WhatsApp.";
          });
          socket.on("pairing-code", code => {
            const container = document.getElementById("pairing-code");
            container.innerHTML = "";
            code.split("-").forEach((group, i, arr) => {
              for (const char of group) {
                const el = document.createElement("span");
                el.className = "pairing-char";
                el.textContent = char;
                container.appendChild(el);
              }
              if (i !== arr.length - 1) {
                // Add space between groups
                const spacer = document.createElement("span");
                spacer.style.width = "12px";
                container.appendChild(spacer);
              }
            });
          });
          socket.on("qr-error", () => {
            statusEl.textContent = "Failed to create QR. Try reload.";
          });
          socket.on("pairing-error", e => {
            const container = document.getElementById("pairing-code");
            container.innerHTML = "";
            const errorSpan = document.createElement("span");
            errorSpan.textContent = "Error: " + e;
            errorSpan.style.color = "#c00";
            errorSpan.style.fontWeight = "bold";
            container.appendChild(errorSpan);
          });
          socket.on("login-success", () => {
            document.body.innerHTML = "<div style='display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;'><h1>Successfully Logged in!</h1><p>Window will close in 5 seconds...</p></div>";
            setTimeout(() => window.close(), 5000);
          });
        </script>
      </body>
    </html>
  `);
});

server.listen(process.env.PORT || 8000);

async function saveAuthStateToMongo(attempt = 1) {
  try {
    if (!fs.existsSync(authDir)) {
      console.warn(`${authDir} does not exist. Skipping save.`);
      return;
    }

    const staging = db.collection('wahbuddy_sessions_staging');
    const main = sessionCollection;

    const files = fs.readdirSync(authDir);
    for (const file of files) {
      const filePath = path.join(authDir, file);
      const data = fs.readFileSync(filePath, 'utf-8');

      await staging.updateOne(
        { _id: file },
        { $set: { data } },
        { upsert: true }
      );
    }

    const staged = await staging.find({}).toArray();
    for (const doc of staged) {
      await main.updateOne(
        { _id: doc._id },
        { $set: { data: doc.data } },
        { upsert: true }
      );
    }

    await staging.deleteMany({});
    console.log('Session credentials successfully saved/updated in MongoDB.');
  } catch (err) {
    if (attempt < 5) {
      console.warn(`Retrying creds update... attempt ${attempt + 1}`);
      await saveAuthStateToMongo(attempt + 1);
    } else {
      console.error(
        `Failed to update creds in MongoDB after ${attempt} attempts:`,
        err
      );
    }
  }
}

async function restoreAuthStateFromMongo() {
  if (fs.existsSync(authDir)) fs.rmSync(authDir, { recursive: true, force: true });
  fs.mkdirSync(authDir, { recursive: true });

  const savedCreds = await sessionCollection.find({}).toArray();
  if (!savedCreds.length) {
    //console.warn('No session found in MongoDB !');
    initialConnect = true;
    return false;
  }

  try {
    for (const { _id, data } of savedCreds) {
      fs.writeFileSync(path.join(authDir, _id), data, 'utf-8');
    }
    console.log('Session restored from MongoDB');
    return true;
  } finally {
    console.error("Failed to restore session from MongoDB !");
    await sessionCollection.deleteMany({});
    await stagingsessionCollection.deleteMany({});
    if (fs.existsSync(authDir)) fs.rmSync(authDir, { recursive: true, force: true });
    fs.mkdirSync(authDir, { recursive: true });

    initialConnect = true;
    return false;
  }
}

export let chatsCollection;
export let messagesCollection;
export let contactsCollection;

let mongoConnected = false;
let commandsLoaded = false;
let initialConnect = true;

const commands = new Map();

async function loadCommands() {
  if (commandsLoaded) return commands;

  const modulesPath = path.join(__dirname, 'modules');
  const moduleFiles = fs
    .readdirSync(modulesPath)
    .filter(file => file.endsWith('.js'));

  for (const file of moduleFiles) {
    const module = await import(`./modules/${file}`);

    const entries = Array.isArray(module.default)
      ? module.default
      : [module.default];

    for (const cmd of entries) {
      if (cmd.name && cmd.execute) {
        const names = Array.isArray(cmd.name) ? cmd.name : [cmd.name];
        for (const name of names) {
          commands.set(name, cmd);
          if (initialConnect) {
            const cleanName = name.startsWith('.') ? name.slice(1) : name;
            console.log(`Loaded Module: ${cleanName}`);
          }
        }
      }
    }
  }
  commandsLoaded = true;
  return commands;
}

export function getAllCommands() {
  const seen = new Set();
  const uniqueCommands = [];
  for (const cmd of commands.values()) {
    if (!seen.has(cmd)) {
      uniqueCommands.push(cmd);
      seen.add(cmd);
    }
  }
  return uniqueCommands;
}

async function startBot() {
  const mongoClient = new MongoClient(mongoUri);
  if (!mongoConnected) {
    await mongoClient.connect();
    mongoConnected = true;
    if (initialConnect) console.log('Connected to MongoDB');
  }
  db = mongoClient.db(dbName);
  sessionCollection = db.collection('wahbuddy_sessions');
  stagingsessionCollection = db.collection('wahbuddy_sessions_staging');
  chatsCollection = db.collection('chats');
  messagesCollection = db.collection('messages');
  contactsCollection = db.collection('contacts');

  const restored = await restoreAuthStateFromMongo();

  const { state, saveCreds } = await useMultiFileAuthState(authDir);
  const { version } = await fetchLatestBaileysVersion();

  const getMessage = async key => {
    const message = await messagesCollection.findOne({
      'key.id': key.id,
      'key.remoteJid': key.remoteJid,
      'key.fromMe': key.fromMe,
    });
    return message?.message || null;
  };

  const sock = makeWASocket({
    version,
    auth: state,
    browser: ['Wahbuddy', 'Safari', '1.0'],
    syncFullHistory: true,
    getMessage,
    generateHighQualityLinkPreview: true,
    logger: pino({ level: 'silent' }),
    defaultQueryTimeoutMs: undefined,
    keepAliveIntervalMs: 5000,
    markOnlineOnConnect: false,
  });

  sock.ev.on(
    'creds.update',
    debounce(async () => {
      await saveCreds();
      await saveAuthStateToMongo();
    }, 1000)
  );

  sock.ev.on(
    'connection.update',
    async (update) => {
      const { connection, lastDisconnect, qr } = update;
		
      if (qr && qr !== lastQR) {
        lastQR = qr;
        loggedIn = false;
        lastQrTimestamp = Date.now();

        if (io.engine.clientsCount > 0) {
          try {
            const qrDataUrl = await qrcode.toDataURL(qr);
            lastQrDataUrl = qrDataUrl;
            io.emit("qr", qrDataUrl);
            io.emit("qr-meta", { ts: lastQrTimestamp, qrLen: qr.length });
          } catch (err) {
            console.error("Failed to generate QR image:", err);
            io.emit("qr-raw", qr);
            io.emit("qr-error", { msg: "qr-generation-failed", err: String(err) });
          }
        } else {
          lastQrDataUrl = null;
        }

        console.log(`Please visit ${SITE_URL}/auth to get the login instructions.`);
        
        setTimeout(() => {
          if (lastQrTimestamp && (Date.now() - lastQrTimestamp) > 65_000) {
            if (Date.now() - lastQrTimestamp > 65_000) {
              lastQR = null;
              lastQrDataUrl = null;
              lastQrTimestamp = 0;
            }
          }
        }, 66_000);
      }

	  if (connection === 'close') {
	    lastQR = null;
	    lastQrDataUrl = null;
	    lastQrTimestamp = 0;
	    commandsLoaded = false;

	    clearInterval(globalThis.autodpInterval);
	    clearInterval(globalThis.autobioInterval);
	    clearInterval(globalThis.autonameInterval);
	    globalThis.autodpInterval = null;
	    globalThis.autobioInterval = null;
	    globalThis.autonameInterval = null;
	    autoDPStarted = false;
	    autoBioStarted = false;
	    autoNameStarted = false;
	
	    const reason = lastDisconnect?.error?.output?.statusCode;

	    if (reason === DisconnectReason.loggedOut) {
	        console.log('Logged out permanently. Session crashed !');
	        if (fs.existsSync(authDir)) fs.rmSync(authDir, { recursive: true, force: true });
	        await sessionCollection.deleteMany({});
	        await stagingsessionCollection.deleteMany({});
   	   } else {
        console.log('Connection closed. Reconnecting...');

        if (!globalThis.reconnecting) {
            globalThis.reconnecting = true;
            setTimeout(async () => {
                globalThis.reconnecting = false;
                await startBot();
            }, 5000);
        }
    }	
	} else if (connection === 'open') {
        loggedIn = true;
        lastQR = null;
        lastQrDataUrl = null;
        lastQrTimestamp = 0;
        io.emit("login-success");
        console.log("Authenticated with WhatsApp");

        if (!commandsLoaded) {
          await loadCommands();
        }

        if (initialConnect) {
          console.log('WahBuddy is Online!');
        }

        initialConnect = false;

        await new Promise(resolve => setTimeout(resolve, 5000));

        // Start AutoDP if enabled
        if (!autoDPStarted && autoDP === 'True' && commands.has('.autodp')) {
          autoDPStarted = true;
          try {
            await startAutoDP(sock, sock.user.id);
          } catch (error) {
            console.error(`AutoDP Error: ${error.message}`);
          }
        }

        // Start AutoName if enabled
        if (
          !autoNameStarted &&
          autoname === 'True' &&
          commands.has('.autoname')
        ) {
          autoNameStarted = true;
          try {
            await startAutoName(sock);
          } catch (error) {
            console.error(`AutoName Error: ${error.message}`);
          }
        }

        // Start AutoBio if enabled
        if (!autoBioStarted && autobio === 'True' && commands.has('.autobio')) {
          autoBioStarted = true;
          try {
            await startAutoBio(sock);
          } catch (error) {
            console.error(`AutoBio Error: ${error.message}`);
          }
        }
      }
    }
  );

  sock.ev.on('chats.upsert', async chats => {
    for (const chat of chats) {
      await chatsCollection.updateOne(
        { id: chat.id },
        { $set: chat },
        { upsert: true }
      );
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (!messages || !messages.length) return;

    for (const msg of messages) {
      await messagesCollection.updateOne(
        { 'key.id': msg.key.id },
        { $set: msg },
        { upsert: true }
      );
    }

    if (type !== 'notify') return;

    const msg = messages[0];
    if (!msg.message) return;

    if (!msg.key.fromMe) {
      try {
        await handleAfkMessages(msg, sock);
      } catch (err) {
        console.error('Error in AFK module:', err);
      }
    }

    if (msg.key.fromMe) {
      const messageContent =
        msg.message.conversation ||
        msg.message.extendedTextMessage?.text ||
        msg.message.imageMessage?.caption ||
        msg.message.videoMessage?.caption ||
        '';

      const args = messageContent.trim().split(/\s+/);
      const command = args.shift().toLowerCase();

      if (commands.has(command)) {
        try {
          await commands.get(command).execute(msg, args, sock);
        } catch (err) {
          console.error(`Error executing ${command}:`, err);
        }
      }
    }
  });

  sock.ev.on('contacts.upsert', async contacts => {
    for (const contact of contacts) {
      await contactsCollection.updateOne(
        { id: contact.id },
        { $set: contact },
        { upsert: true }
      );
    }
  });

  sock.ev.on('messaging-history.set', async ({ chats, contacts, messages }) => {
    for (const chat of chats) {
      await chatsCollection.updateOne(
        { id: chat.id },
        { $set: chat },
        { upsert: true }
      );
    }

    for (const contact of contacts) {
      await contactsCollection.updateOne(
        { id: contact.id },
        { $set: contact },
        { upsert: true }
      );
    }

    for (const message of messages) {
      await messagesCollection.updateOne(
        { 'key.id': message.key },
        { $set: message },
        { upsert: true }
      );
    }
    console.log('Full sync done !');
  });

  sock.ev.on('messages.update', async updates => {
    for (const update of updates) {
      if (!update.key?.id) continue;
      await messagesCollection.updateOne(
        { 'key.id': update.key.id },
        { $set: update },
        { upsert: true }
      );
    }
  });

  sock.ev.on('messages.delete', async ({ keys }) => {
    for (const key of keys) {
      await messagesCollection.deleteOne({ 'key.id': key.id });
    }
  });

  sock.ev.on('contacts.update', async updates => {
    for (const update of updates) {
      await contactsCollection.updateOne(
        { id: update.id },
        { $set: update },
        { upsert: true }
      );
    }
  });

  sock.ev.on('chats.update', async updates => {
    for (const update of updates) {
      if (!update.id) continue;
      await chatsCollection.updateOne(
        { id: update.id },
        { $set: update },
        { upsert: true }
      );
    }
  });
}

startBot();

export { db };
