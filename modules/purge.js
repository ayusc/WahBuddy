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

const wait = ms => new Promise(r => setTimeout(r, ms));

async function deleteForEveryone(sock, jid, key) {
  try {
    await sock.sendMessage(jid, { delete: key });
  } catch {}
}

async function deleteForMe(sock, jid, msg) {
  try {
    await sock.chatModify(
      {
        clear: {
          messages: [
            {
              id: msg.key.id,
              fromMe: true,
              timestamp: Number(msg.messageTimestamp || Date.now())
            }
          ]
        }
      },
      jid
    );
  } catch {}
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
      await sock.sendMessage(jid, { text: 'Reply to a message to purge.' }, { quoted: msg });
      return;
    }

    const repliedMsg = await messagesCollection.findOne({
      'key.id': quotedMsgId,
      'key.remoteJid': jid
    });

    if (!repliedMsg) {
      await sock.sendMessage(
        jid,
        { text: 'Could not find the replied message in history.' },
        { quoted: msg }
      );
      return;
    }

    const purgeAll = args[0] === 'all';
    const purgeCount = purgeAll ? 1000 : parseInt(args[0] || '1') + 1;

    const messagesToDelete = await messagesCollection
      .find({
        'key.remoteJid': jid,
        messageTimestamp: { $gte: repliedMsg.messageTimestamp }
      })
      .sort({ messageTimestamp: 1 })
      .limit(purgeCount)
      .toArray();

    messagesToDelete.push(msg);

    for (const m of messagesToDelete) {
      await deleteForEveryone(sock, jid, m.key);
      await deleteForMe(sock, jid, m);
      await wait(500);
    }

    await sock.sendMessage(jid, { text: `Purged ${messagesToDelete.length} messages.` });
  }
};
