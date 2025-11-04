const socket = io();
const statusEl = document.getElementById("status");
const qrImg = document.getElementById("qr");
const phoneErrorEl = document.getElementById("phone-error");

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
  phoneErrorEl.textContent = "";
  let number = phoneInput.value.replace(/\D/g, "");
  let fullNumber = iti.getSelectedCountryData().dialCode ? "+" + iti.getSelectedCountryData().dialCode + number : number;
  
  if (!number) {
    phoneErrorEl.textContent = "Please enter a phone number.";
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
    text: qr,
    width: 300,
    height: 300,
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
```eof

### 5. `auth.js`

```javascript:Authentication Logic:auth.js
import http from 'http';
import { Server } from 'socket.io';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  Browsers,
} from 'baileys';
import { MongoClient } from 'mongodb';
import pino from 'pino';
import app from './app.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
            io.emit('login-success');
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
          await new Promise(resolve => setTimeout(resolve, 2000)); 

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
    if (getLoggedInState()) {
      return res.status(404).send("Already logged in!");
    }
    
    res.sendFile(path.join(__dirname, 'public', 'index.al.html'));
  });
}
