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

import fs from 'fs';
import path from 'path';
import readline from 'readline';
import dotenv from 'dotenv';
import { MongoClient } from 'mongodb';
import { makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, Browsers } from 'baileys';
import { Boom } from '@hapi/boom';
import qrcode from 'qrcode-terminal';
import pino from 'pino';

dotenv.config();

const authDir = './wahbuddy-auth';
const MONGO_URI = process.env.MONGO_URI;
const DB_NAME = 'wahbuddy';

function prompt(query) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(query, ans => {
    rl.close();
    resolve(ans);
  }));
}

async function checkIfSessionExists(db) {
  const sessionCollection = db.collection('wahbuddy_sessions');
  const credsDoc = await sessionCollection.findOne({ _id: 'creds.json' });
  if (!credsDoc) return false;
  try {
    const creds = JSON.parse(credsDoc.data);
    if (!creds || typeof creds !== 'object') return false;
  } catch {
    return false;
  }
  const keysExist = await sessionCollection.findOne({
    _id: { $regex: /^keys\// }
  });
  return !!keysExist;
}


async function saveSessionToMongo(db) {
  const sessionCollection = db.collection('wahbuddy_sessions');
  const staging = db.collection('wahbuddy_sessions_staging');

  const files = fs.readdirSync(authDir);
  for (const file of files) {
    const filePath = path.join(authDir, file);
    const data = fs.readFileSync(filePath, 'utf-8');
    await staging.updateOne({ _id: file }, { $set: { data } }, { upsert: true });
  }

  const staged = await staging.find({}).toArray();
  for (const doc of staged) {
    await sessionCollection.updateOne({ _id: doc._id }, { $set: { data: doc.data } }, { upsert: true });
  }

  await staging.deleteMany({});
  await new Promise(resolve => setTimeout(resolve, 5000));
  console.log('Session saved to MongoDB');
}

async function getPairingCode() {
  const mongo = new MongoClient(MONGO_URI);
  await mongo.connect();
  console.log('Connected to MongoDB');
  
  const db = mongo.db(DB_NAME);
  
  const sessionExists = await checkIfSessionExists(db);
  if (sessionExists) {
    console.log('Found existing session files for Wahbuddy!\nExiting ....');
    process.exit(1);
  }

  fs.mkdirSync(authDir, { recursive: true });
  const { state, saveCreds } = await useMultiFileAuthState(authDir);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    browser: Browsers.macOS('Safari'),
    printQRInTerminal: false,
    //syncFullHistory: true, # we can't sync the history on a browser environment we need a Desktop environment for that
    defaultQueryTimeoutMs: undefined,
    logger: pino({ level: 'silent' }),
  });

  if (!state.creds.registered) {
    const phone = await prompt('Enter your phone number (in E.164 format, no "+"): ');
    try {
      const code = await sock.requestPairingCode(phone);
      const formattedCode = code.match(/.{1,4}/g).join('-');
      console.log(`Pairing code: ${formattedCode}`);

    } catch (err) {
      console.error('Failed to get pairing code:', err);
      process.exit(1);
    }
  }

  sock.ev.on('connection.update', async ({ connection }) => {
    if (connection === 'open') {
      console.log('Connected to WhatsApp');
    }
  });

  sock.ev.on('creds.update', async () => {
    await saveCreds();
    console.log('\nUploading session to MongoDB ....');
    await saveSessionToMongo(db);
    console.log('\nCode completed successfully !');  
  });
 }

getPairingCode();
