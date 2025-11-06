import { messagesCollection } from '../main.js';

const wait = ms => new Promise(res => setTimeout(res, ms));

async function deleteForEveryone(sock, jid, key) {
  try {
    await sock.sendMessage(jid, { delete: key });
    return true;
  } catch (err) {
    console.error('Delete for everyone failed:', err.message);
    return false;
  }
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
              timestamp: Number(msg.messageTimestamp || Date.now()),
            },
          ],
        },
      },
      jid
    );
    return true;
  } catch (err) {
    console.error('Delete for me failed:', err.message);
    return false;
  }
}

export default {
  name: ['.purge'],
  description: 'Deletes a replied message and optionally following messages.',
  usage:
    '.purge [count|all]\nReply to a message and type .purge, .purge n, or .purge all to delete that message or n messages after it.',

  async execute(msg, args, sock) {
    const jid = msg.key.remoteJid;
    const contextInfo = msg.message?.extendedTextMessage?.contextInfo;
    const quotedMsgId = contextInfo?.stanzaId;
    const quotedParticipant = contextInfo?.participant || msg.participant;

    if (!quotedMsgId) {
      await sock.sendMessage(jid, { text: 'Please reply to a message to purge.' }, { quoted: msg });
      return;
    }

    const repliedMsg = await messagesCollection.findOne({
      'key.id': quotedMsgId,
      'key.remoteJid': jid,
    });

    if (!repliedMsg) {
      await sock.sendMessage(
        jid,
        { text: 'Could not find the replied message in history.\nPerhaps it has been deleted?' },
        { quoted: msg }
      );
      return;
    }

    const purgeAll = args[0] === 'all';
    const purgeCount = purgeAll ? 1000 : parseInt(args[0] || '1') + 1;

    // fetch messages after the replied one
    const messagesToDelete = await messagesCollection
      .find({
        'key.remoteJid': jid,
        messageTimestamp: { $gte: repliedMsg.messageTimestamp },
      })
      .sort({ messageTimestamp: 1 })
      .limit(purgeCount)
      .toArray();

    console.log(`Purging ${messagesToDelete.length} messages...`);

    let deleted = 0;
    for (const m of messagesToDelete) {
      const key = m.key;

      // delete for everyone if possible (only works if recent)
      const success = await deleteForEveryone(sock, jid, key);
      if (!success) await deleteForMe(sock, jid, m);

      deleted++;
      if (deleted % 5 === 0) await wait(1000); // small pause to avoid flooding
    }

    await sock.sendMessage(jid, { text: `Purged ${deleted} messages.` });
  },
};
