import { messagesCollection } from '../main.js';

async function deleteMessageWithRetry(sock, jid, message, maxRetries = 10) {
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
      console.warn(
        `Retry ${attempt}/${maxRetries} failed for ${originalKey.id}:`,
        err
      );
      if (attempt === maxRetries) {
        console.error(
          `Message ${originalKey.id} failed to delete after ${maxRetries} attempts`
        );
        return false;
      }
    }
  }
}

export default {
  name: ['.purge'],
  description: 'Deletes a replied message and optionally following messages.',
  usage:
    '.purge [count|all]\nReply to a message and type .purge, .purge n, or .purge all to delete the message or delete n messages after that (including that message) or delete all the messages after that (including that message)',

  async execute(msg, args, sock) {
    const jid = msg.key.remoteJid;

    const contextInfo = msg.message?.extendedTextMessage?.contextInfo;
    const quotedMsgId = contextInfo?.stanzaId;
    const quotedParticipant = contextInfo?.participant || msg.participant;

    if (!quotedMsgId) {
      await sock.sendMessage(
        jid,
        {
          text: 'Please reply to a message to purge.',
        },
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
      if (!repliedMsg) await new Promise(resolve => setTimeout(resolve, 1000));
    }

    if (!repliedMsg) {
      await sock.sendMessage(
        jid,
        {
          text: 'Could not find the replied message in history.\nPerhaps it has been deleted ?',
        },
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
      await Promise.all(
        batch.map(msg => deleteMessageWithRetry(sock, jid, msg))
      );
    }
  },
};
