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
      await staging.updateOne({ _id: file }, { $set: { data } }, { upsert: true });
    }

    const staged = await staging.find({}).toArray();
    for (const doc of staged) {
      await main.updateOne({ _id: doc._id }, { $set: { data: doc.data } }, { upsert: true });
    }

    await staging.deleteMany({});
    console.log('Pairing session credentials saved to MongoDB.');
  } catch (err) {
    if (attempt < 5) {
      console.warn(`Retrying pairing creds update... attempt ${attempt + 1}`);
      await savePairingAuthToMongo(db, sessionCollection, attempt + 1);
    } else {
      console.error(`Failed to update pairing creds in MongoDB after ${attempt} attempts:`, err);
    }
  }
}

export function initAuth(getLoggedInState) {
  io.on('connection', socket => {
    socket.on('request-code', async ({ phone }) => {
      let mongoClient;
      try {
        console.log('Received phone from client:', phone);

        if (!phone || typeof phone !== 'string' || !/^\+?\d+$/.test(phone)) {
          socket.emit('pairing-error', 'Invalid phone number! Only digits are allowed.');
          return;
        }

        mongoClient = new MongoClient(mongoUri);
        await mongoClient.connect();
        const db = mongoClient.db(dbName);
        const sessionCollection = db.collection('wahbuddy_sessions');

        if (fs.existsSync(authDir))
          fs.rmSync(authDir, { recursive: true, force: true });
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
            socket.emit('login-success');
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
          await new Promise(resolve => setTimeout(resolve, 1000));

          const cleanPhone = phone.replace(/^\+/, '');
          console.log('Requesting pairing code for:', cleanPhone);

          try {
            const code = await sock.requestPairingCode(cleanPhone);

            if (!code) {
              console.warn('No pairing code returned, retrying once...');
              const retryCode = await sock.requestPairingCode(cleanPhone);
              if (!retryCode) {
                socket.emit('pairing-error', 'No pairing code received. Please retry.');
                return;
              }
              const formatted = retryCode.match(/.{1,4}/g).join('-');
              socket.emit('pairing-code', formatted);
              console.log('Pairing code:', formatted);
            } else {
              const formatted = code.match(/.{1,4}/g).join('-');
              socket.emit('pairing-code', formatted);
              console.log('Pairing code:', formatted);
            }
          } catch (err) {
            console.error('Failed to get pairing code:', err);
            socket.emit('pairing-error', err.message || String(err));
          }
        }
      } catch (err) {
        console.error('Pairing code error:', err);
        socket.emit('pairing-error', err.message || String(err));
      } finally {
        if (mongoClient) await mongoClient.close().catch(() => {});
      }
    });
  });

  app.get('/', (req, res) => {
    const isLoggedIn = typeof getLoggedInState === 'function' ? getLoggedInState() : false;
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');

    if (isLoggedIn) return res.status(200).send('Already logged in!');
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });
}
