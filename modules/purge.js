import { messagesCollection } from '../main.js';

export default {
  name: '.purge',
  description: 'Deletes a replied message and optionally following messages.',
  usage: '.purge [count]\nReply to a message and type .purge or .purge 100',

  async execute(msg, args, sock) {
    const jid = msg.key.remoteJid;

    const contextInfo = msg.message?.extendedTextMessage?.contextInfo;
    const quotedMsgId = contextInfo?.stanzaId;

    if (!quotedMsgId) {
      await sock.sendMessage(jid, {
        text: 'Please reply to a message to purge!',
      }, { quoted: msg });
      return;
    }

    const purgeCount = parseInt(args[0] || '1');
    if (isNaN(purgeCount) || purgeCount < 1) {
      await sock.sendMessage(jid, {
        text: 'Invalid purge count!',
      }, { quoted: msg });
      return;
    }

    // Get the replied message from DB
    const repliedMsg = await messagesCollection.findOne({ 'key.id': quotedMsgId });
    if (!repliedMsg) {
      await sock.sendMessage(jid, {
        text: 'Could not find the replied message in history.',
      }, { quoted: msg });
      return;
    }

    // Fetch next N messages after the replied one (sorted by timestamp)
    const targetMessages = await messagesCollection.find({
      'key.remoteJid': jid,
      'messageTimestamp': { $gte: repliedMsg.messageTimestamp }
    })
    .sort({ messageTimestamp: 1 })
    .limit(purgeCount)
    .toArray();

    // Purge each message
    for (const message of targetMessages) {
      const key = message.key;

      try {
        await sock.sendMessage(jid, { delete: key });
      } catch (err) {
        try {
          // Fallback to self-deletion if delete for everyone fails
          await sock.sendMessage(jid, {
            delete: {
              ...key,
              participant: sock.user.id,
            }
          });
        } catch {}
      }
    }
  }
};
