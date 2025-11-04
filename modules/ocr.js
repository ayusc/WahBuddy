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
import { writeFileSync, unlinkSync, createReadStream } from 'fs';
import path from 'path';
import pino from 'pino';
const logger = pino();
import { downloadMediaMessage } from 'baileys';

dotenv.config();

const OCR_SPACE_API_KEY = process.env.OCR_SPACE_API_KEY;

if (!OCR_SPACE_API_KEY) {
  throw new Error('OCR_SPACE_API_KEY is not set');
}

export default {
  name: ['.ocr'],
  description: 'Extracts text from an image using OCR',
  usage: '.ocr <lang> in reply to an image. Defaults to eng if not specified.',

  async execute(msg, args, sock) {
    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const sender = msg.key.remoteJid;

    if (!quoted || !quoted.imageMessage) {
      await sock.sendMessage(
        sender,
        { text: 'Please reply to an image message.' },
        { quoted: msg }
      );
      return;
    }

    const lang = args[0] || 'eng';

    const mediaBuffer = await downloadMediaMessage(
      { message: { imageMessage: quoted.imageMessage } },
      'buffer',
      {},
      { logger }
    );

    if (!mediaBuffer) {
      await sock.sendMessage(
        sender,
        { text: 'Failed to download image from message.' },
        { quoted: msg }
      );
      return;
    }

    const tempPath = path.join('./', `ocr.jpg`);
    const MAX_SIZE = 1000 * 1024;

    let finalBuffer = mediaBuffer;

    if (mediaBuffer.length > MAX_SIZE) {
      let quality = 80;
      try {
        while (quality >= 30) {
          const compressed = await sharp(mediaBuffer)
            .resize({ width: 1024, withoutEnlargement: true })
            .jpeg({ quality })
            .toBuffer();

          if (compressed.length <= MAX_SIZE) {
            finalBuffer = compressed;
            logger.info(
              `Compressed image to ${compressed.length} bytes at quality ${quality}`
            );
            break;
          }

          quality -= 10;
        }

        if (quality < 30) {
          throw new Error('Unable to compress under size limit');
        }
      } catch {
        logger.error('Failed to compress image:', err);
        await sock.sendMessage(sender, {
          text: 'Image is too large and could not be compressed enough. Please try with a smaller image.',
          quoted: msg,
        });
        return;
      }
    }

    writeFileSync(tempPath, finalBuffer);

    const formData = new FormData();
    formData.append('apikey', OCR_SPACE_API_KEY);
    formData.append('language', lang);
    formData.append('OCREngine', '2');
    formData.append('detectOrientation', 'true');
    formData.append('isOverlayRequired', 'false');
    formData.append('scale', 'true');
    formData.append('file', createReadStream(tempPath));

    const sent = await sock.sendMessage(
      sender,
      { text: `Processing image using language "${lang}"...` },
      { quoted: msg }
    );

    try {
      const headers = formData.getHeaders();
      headers['Content-Length'] = await new Promise((resolve, reject) =>
        formData.getLength((err, length) => {
          if (err) reject(err);
          else resolve(length);
        })
      );

      const response = await fetch('https://api.ocr.space/parse/image', {
        method: 'POST',
        headers,
        body: formData,
      });

      const result = await response.json();

      if (result.IsErroredOnProcessing) {
        const errorText = result.ErrorMessage?.[0] || 'OCR processing failed.';
        await sock.sendMessage(sender, {
          text: `Error: ${errorText}`,
          edit: sent.key,
        });
      } else {
        const parsedText = result.ParsedResults?.[0]?.ParsedText?.trim();
        const finalText = parsedText
          ? `OCR Result:\n\n${parsedText}`
          : 'No readable text found in the image.';
        await sock.sendMessage(sender, { text: finalText, edit: sent.key });
      }
    } catch {
      await sock.sendMessage(sender, {
        text: 'OCR failed to process the image.',
        edit: sent.key,
      });
    } finally {
      unlinkSync(tempPath);
    }
  },
};
