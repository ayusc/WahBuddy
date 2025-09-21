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

import { translate } from '@vitalets/google-translate-api';
import { getContentType, downloadContentFromMessage } from 'baileys';

export default {
  name: ['.tr'],
  description:
    'Translates given text or replied message to the specified language.',
  usage:
    '`.tr <language_code> <text>` or reply with `.tr <language_code>` (defaults to English if no language_code is given)',

  async execute(msg, args, sock) {
    const jid = msg.key.remoteJid;
    let langCode = 'en'; // Default target language
    let textToTranslate;

    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const quotedType = quoted && getContentType(quoted);
    const quotedText =
      quotedType === 'conversation'
        ? quoted.conversation
        : quotedType === 'extendedTextMessage'
          ? quoted.extendedTextMessage?.text
          : quotedType === 'textMessage'
            ? quoted.textMessage?.text
            : null;

    if (quotedText) {
      textToTranslate = quotedText;

      if (args[0] && args[0].length === 2) {
        langCode = args[0];
      }
    } else {
      if (args.length === 0) {
        return await sock.sendMessage(
          jid,
          {
            text: 'Usage: `.tr <language_code> <text>` or reply with `.tr <language_code>`',
          },
          { quoted: msg }
        );
      }

      if (args[0].length === 2) {
        langCode = args[0];
        textToTranslate = args.slice(1).join(' ');

        if (!textToTranslate) {
          return await sock.sendMessage(
            jid,
            {
              text: 'Please provide text to translate.',
            },
            { quoted: msg }
          );
        }
      } else {
        textToTranslate = args.join(' ');
      }
    }

    try {
      const result = await translate(textToTranslate, { to: langCode });
      const fromLang = result.raw?.src || 'unknown';

      await sock.sendMessage(
        jid,
        {
          text: `*Translated from ${fromLang} to ${langCode}:*\n\n${result.text}`,
        },
        { quoted: msg }
      );
    } catch (error) {
      console.error(error);
      await sock.sendMessage(
        jid,
        {
          text: 'Failed to translate. Please check the language code or try again.',
        },
        { quoted: msg }
      );
    }
  },
};
