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

import { messagesCollection } from '../main.js';

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function deleteMessageWithRetry(
  sock,
  jid,
  message,
  maxRetries = 5,
  retryDelay = 500
) {
  const originalKey = message.key;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const delid = await sock.sendMessage(jid, { delete: originalKey });
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
      return true;
    } catch (err) {
      if (attempt === maxRetries) return false;
      await sleep(retryDelay * attempt);
    }
  }
  return false;
}

export default {
  name: ['.purge'],
  description: 'Deletes a replied message and optionally following messages.',
  usage:
    '.purge [count|all]\nReply to a message and type .purge, .purge n, or .purge all.',

  async execute(msg, args, sock) {
    const jid = msg.key.remoteJid;
    const contextInfo = msg.message?.extendedTextMessage?.contextInfo;
    const quotedMsgId = contextInfo?.stanzaId;
    const quotedParticipant = contextInfo?.participant || msg.participant;

    if (!quotedMsgId) {
      await sock.sendMessage(
        jid,
        { text: 'Please reply to a message to purge.' },
        { quoted: msg }
      );
      return;
    }

    let repliedMsg = null;
    const maxWaitTime = 60_000;
    const startTime = Date.now();

    const oldestMsgKey = {
      remoteJid: jid,
      id: quotedMsgId,
      participant: quotedParticipant,
    };

    await sock.fetchMessageHistory(50, oldestMsgKey, Date.now());

    while (!repliedMsg && Date.now() - startTime < maxWaitTime) {
      repliedMsg = await messagesCollection.findOne({
        'key.id': quotedMsgId,
        'key.remoteJid': jid,
      });
      if (!repliedMsg) await sleep(1000);
    }

    if (!repliedMsg) {
      await sock.sendMessage(
        jid,
        { text: 'Could not find the replied message in history.' },
        { quoted: msg }
      );
      return;
    }

    const purgeAll = args[0] === 'all';
    const purgeCount = purgeAll ? 999999 : parseInt(args[0] || '1') + 1;

    const targetMessages = await messagesCollection
      .find({
        'key.remoteJid': jid,
        messageTimestamp: { $gte: repliedMsg.messageTimestamp },
      })
      .sort({ messageTimestamp: 1 })
      .limit(purgeCount)
      .toArray();

    const allMessagesToDelete = [...targetMessages, msg];

    const batchSize = 5;
    for (let i = 0; i < allMessagesToDelete.length; i += batchSize) {
      const batch = allMessagesToDelete.slice(i, i + batchSize);
      await Promise.all(batch.map(m => deleteMessageWithRetry(sock, jid, m)));
      await sleep(500);
    }
  },
};
