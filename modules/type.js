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

export default {
  name: ['.type'],
  description: 'Simulates typing effect like a typewriter',
  usage: '.type [text] (or reply to a message)',

  async execute(msg, args, sock) {
    const jid = msg.key.remoteJid; // Try to get text from arguments or replied message

    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const quotedText =
      quoted?.conversation || quoted?.extendedTextMessage?.text;
    const text = args.length ? args.join(' ') : quotedText;

    if (!text) {
      return sock.sendMessage(
        jid,
        { text: 'Give me something to type or reply to a text message.' },
        { quoted: msg }
      );
    }

    let typed = '';
    const typingSymbol = '|';
    const SLEEP = 200;
    const delay = ms => new Promise(res => setTimeout(res, ms));

    const delid = await sock.sendMessage(jid, { delete: msg.key });

    await sock.chatModify(
      {
        deleteForMe: {
          deleteMedia: true,
          key: {
            id: delid.key.id,
            remoteJid: jid,
            fromMe: true,
          },
          timestamp: Number(delid.messageTimestamp),
        },
      },
      jid
    );

    const sent = await sock.sendMessage(jid, { text: typingSymbol });

    for (const char of text) {
      await sock.sendMessage(jid, {
        text: typed + typingSymbol,
        edit: sent.key,
      });
      await delay(SLEEP);
      typed += char;
      await sock.sendMessage(jid, { text: typed, edit: sent.key });
      await delay(SLEEP);
    }
  },
};
