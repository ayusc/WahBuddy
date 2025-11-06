import { messagesCollection } from '../main.js';

const wait = ms => new Promise(r => setTimeout(r, ms));

async function deleteForEveryone(sock, jid, key) {
  try {
    await sock.sendMessage(jid, { delete: key });
    return { success: true, key };
  } catch (err) {
    return { success: false, error: err, key };
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
              timestamp: Number(msg.messageTimestamp || Date.now())
            }
          ]
        }
      },
      jid
    );
    return { success: true, key: msg.key };
  } catch (err) {
    return { success: false, error: err, key: msg.key };
  }
}

export default {
  name: ['.purge'],
  description: 'Deletes a replied message and optionally following messages.',
  usage:
    '.purge [count|all]\nReply to a message then type .purge, .purge n or .purge all.',

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
    const count = purgeAll ? 1000 : parseInt(args[0] || '1') + 1;

    const messagesToDelete = await messagesCollection
      .find({
        'key.remoteJid': jid,
        messageTimestamp: { $gte: repliedMsg.messageTimestamp }
      })
      .sort({ messageTimestamp: 1 })
      .limit(count)
      .toArray();

    // add the command message itself
    messagesToDelete.push(msg);

    for (const m of messagesToDelete) {
      const result = await deleteForEveryone(sock, jid, m.key);
      if (!result.success) {
        await deleteForMe(sock, jid, m);
      }
      await wait(500);
    }

    await sock.sendMessage(jid, { text: `Purged ${messagesToDelete.length} messages.` });
  }
};
