export default {
  name: '.purge',
  description: 'Deletes a replied message and optionally following messages.',
  usage: '.purge [count|all]\nReply to a message and type .purge, .purge n, or .purge all to delete the message or delete n messages after that (including that message) or delete all the messages after that (including that message)',

  async execute(msg, args, sock, db) {
    const jid = msg.key.remoteJid;
    const messagesCollection = db.collection('messages');

    const contextInfo = msg.message?.extendedTextMessage?.contextInfo;
    const quotedMsgId = contextInfo?.stanzaId;
    const quotedParticipant = contextInfo?.participant || msg.participant;

    if (!quotedMsgId) {
      await sock.sendMessage(jid, {
        text: 'Please reply to a message to purge.',
      }, { quoted: msg });
      return;
    }

    // Fetch replied message from DB
    const repliedMsg = await messagesCollection.findOne({ 'key.id': quotedMsgId, 'key.remoteJid': jid });
    if (!repliedMsg) {
      await sock.sendMessage(jid, {
        text: 'Could not find the replied message in history.',
      }, { quoted: msg });
      return;
    }

    // Sync fresh history to avoid missing messages
    await sock.fetchMessageHistory(1000, repliedMsg.key, repliedMsg.messageTimestamp);

    // Determine purge mode
    const purgeAll = args[0] === 'all';
    const purgeCount = purgeAll ? 999999 : parseInt(args[0] || '1');

    // Get messages to delete (replied msg and next ones)
    const targetMessages = await messagesCollection.find({
      'key.remoteJid': jid,
      'messageTimestamp': { $gte: repliedMsg.messageTimestamp }
    })
    .sort({ messageTimestamp: 1 })
    .limit(purgeCount)
    .toArray();

    for (const message of targetMessages) {
      const key = message.key;

      try {
        // Delete for everyone
        await sock.sendMessage(jid, { delete: key });

        // Small delay to ensure delete for everyone is processed
        await new Promise(r => setTimeout(r, 100));

        // Delete for self to remove "you deleted this message"
        await sock.sendMessage(jid, {
          delete: {
            remoteJid: jid,
            fromMe: true,
            id: key.id,
            participant: sock.user.id,
          }
        });
      } catch (err) {
        // Fail silently on errors (e.g. old messages, already deleted)
      }
    }
  }
};
