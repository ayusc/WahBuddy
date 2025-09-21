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

import fetch from 'node-fetch';
import dotenv from 'dotenv';
import FormData from 'form-data';
import fs from 'fs';
import path from 'path';
import pino from 'pino';
const logger = pino();
import { downloadMediaMessage } from 'baileys';

dotenv.config();

const RMBG_API_KEY = process.env.RMBG_API_KEY;

if (!RMBG_API_KEY) {
  throw new Error('RMBG_API_KEY is not set');
}

export default {
  name: ['.rmbg'],
  description: 'Removes background from an image using remove.bg',
  usage: '.rmbg in reply to an image',

  async execute(msg, args, sock) {
    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const sender = msg.key.remoteJid;

    if (!quoted || !quoted.imageMessage) {
      await sock.sendMessage(
        sender,
        { text: 'Reply to an image to remove its background.' },
        { quoted: msg }
      );
      return;
    }

    const imageBuffer = await downloadMediaMessage(
      { message: { imageMessage: quoted.imageMessage } },
      'buffer',
      {},
      { logger }
    );

    if (!imageBuffer) {
      await sock.sendMessage(
        sender,
        { text: 'Failed to download the image.' },
        { quoted: msg }
      );
      return;
    }

    const tempInputPath = path.join('./', `rmbg-input.png`);
    const tempOutputPath = path.join('./', `rmbg-output.png`);
    fs.writeFileSync(tempInputPath, imageBuffer);

    try {
      const formData = new FormData();
      formData.append('image_file', fs.createReadStream(tempInputPath));
      formData.append('scale', '100%');

      const response = await fetch('https://api.remove.bg/v1.0/removebg', {
        method: 'POST',
        headers: {
          'X-Api-Key': RMBG_API_KEY,
        },
        body: formData,
      });

      if (!response.ok) {
        const errorBody = await response.text();
        await sock.sendMessage(
          sender,
          { text: 'Failed to remove background: ' + response.statusText },
          { quoted: msg }
        );
        return;
      }

      const buffer = await response.buffer();
      fs.writeFileSync(tempOutputPath, buffer);

      const messageOptions = {
        image: { url: tempOutputPath },
        caption: 'Background removed successfully',
      };

      await sock.sendMessage(sender, messageOptions, { quoted: msg });
    } catch (err) {
      await sock.sendMessage(
        sender,
        { text: 'Failed to remove background from the image.' },
        { quoted: msg }
      );
    } finally {
      if (fs.existsSync(tempInputPath)) fs.unlinkSync(tempInputPath);
      if (fs.existsSync(tempOutputPath)) fs.unlinkSync(tempOutputPath);
    }
  },
};
