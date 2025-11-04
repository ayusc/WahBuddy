import http from 'http';
import { Server } from 'socket.io';
import fs from 'node:fs';
import path from 'node:path';
import {
  makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  Browsers,
} from 'baileys';
import { MongoClient } from 'mongodb';
import pino from 'pino';
import app from './app.js';

const mongoUri = process.env.MONGO_URI;
const dbName = 'wahbuddy';
const authDir = './wahbuddy-auth';

export const server = http.createServer(app);
export const io = new Server(server);

const debounce = (fn, delay) => {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
};

async function savePairingAuthToMongo(db, sessionCollection, attempt = 1) {
  try {
    if (!fs.existsSync(authDir)) {
      console.warn(`${authDir} (pairing) does not exist. Skipping save.`);
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
    console.log('Pairing session credentials saved to MongoDB.');
  } catch (err) {
    if (attempt < 5) {
      console.warn(`Retrying pairing creds update... attempt ${attempt + 1}`);
      await savePairingAuthToMongo(db, sessionCollection, attempt + 1);
    } else {
      console.error(
        `Failed to update pairing creds in MongoDB after ${attempt} attempts:`,
        err
      );
    }
  }
}

export function initAuth(getLoggedInState) {
  io.on('connection', socket => {
    socket.on('request-code', async ({ phone }) => {
      let mongoClient;
      let db, sessionCollection;
      try {
        console.log("Received phone from client:", phone);

        if (!phone || typeof phone !== 'string' || !/^\+?\d+$/.test(phone)) {
          socket.emit('pairing-error', 'Invalid phone number! Only digits are allowed.');
          return;
        }

        mongoClient = new MongoClient(mongoUri);
        await mongoClient.connect();
        db = mongoClient.db(dbName);
        sessionCollection = db.collection('wahbuddy_sessions');

        if (fs.existsSync(authDir)) fs.rmSync(authDir, { recursive: true, force: true });
        fs.mkdirSync(authDir, { recursive: true });
        const { state, saveCreds } = await useMultiFileAuthState(authDir);
        const { version } = await fetchLatestBaileysVersion();

        const sock = makeWASocket({
          version,
          auth: state,
          browser: Browsers.macOS('Safari'),
          printQRInTerminal: false,
          defaultQueryTimeoutMs: undefined,
          logger: pino({ level: 'silent' }),
        });

        sock.ev.on('connection.update', ({ connection }) => {
          if (connection === 'open') {
            console.log('Pairing successful, connection open.');
            io.emit('login-success'); // Tell the browser page
          }
        });

        sock.ev.on(
          'creds.update',
          debounce(async () => {
            await saveCreds();
            await savePairingAuthToMongo(db, sessionCollection);
          }, 1000)
        );

        if (!state.creds.registered) {
          await new Promise(resolve => setTimeout(resolve, 500)); 

          try {
            const cleanPhone = phone.replace(/^\+/, '');
            console.log('Phone for pairing code:', cleanPhone);

            const code = await sock.requestPairingCode(cleanPhone);
            console.log("Pairing code received:", code);

            if (!code) {
              socket.emit('pairing-error', 'No code received! Please retry.');
            } else {
              const formatted = code.match(/.{1,4}/g).join('-');
              socket.emit('pairing-code', formatted);
            }
          } catch (err) {
            console.error('Failed to get pairing code:', err);
            socket.emit('pairing-error', err.message || String(err));
          }
        }

      } catch (err) {
        console.error('Pairing code error:', err);
        socket.emit('pairing-error', err.message || String(err));
      }
    });
  });

  app.get("/auth", (req, res) => {
    // Use the passed-in function to check the main bot's status
    if (getLoggedInState()) return res.status(404).send("Already logged in!");
    
    // Paste the entire HTML string here
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
          .logo-img { width: 80px; margin-bottom: 8px; }
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
          }
          #phone {
            width: 100%;
            max-width: 300px;
            box-sizing: border-box;
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
          document.getElementById("send-code").onclick = () => {
            let number = phoneInput.value.replace(/\\D/g, "");
            let fullNumber = iti.getSelectedCountryData().dialCode ? "+" + iti.getSelectedCountryData().dialCode + number : number;
            if (!number) {
              alert("Enter a phone number.");
              return;
            }
            console.log("Sending phone to server:", fullNumber);
            socket.emit("request-code", { phone: fullNumber });
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
}
