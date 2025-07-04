import { messagesCollection } from '../main.js';

export default {
  name: '.purge',
  description: 'Deletes a replied message and optionally following messages.',
  usage: '.purge [count|all]\nReply to a message and type .purge, .purge n, or .purge all to delete the message or delete n messages after that (including that message) or delete all the messages after that (including that message)',

  async execute(msg, args, sock) {
    const jid = msg.key.remoteJid;

    const contextInfo = msg.message?.extendedTextMessage?.contextInfo;
    const quotedMsgId = contextInfo?.stanzaId;
    const quotedParticipant = contextInfo?.participant || msg.participant;

    if (!quotedMsgId) {
      await sock.sendMessage(jid, {
        text: 'Please reply to a message to purge.',
      }, { quoted: msg });
      return;
    }

    let repliedMsg = null;
    const maxWaitTime = 60_000;
    const startTime = Date.now();

    while (!repliedMsg && Date.now() - startTime < maxWaitTime) {
      repliedMsg = await messagesCollection.findOne({
        'key.id': quotedMsgId,
        'key.remoteJid': jid,
      });
      if (!repliedMsg) await new Promise(resolve => setTimeout(resolve, 1000));
    }

    if (!repliedMsg) {
      await sock.sendMessage(jid, {
        text: 'Could not find the replied message in history.\nPerhaps it has been deleted ?',
      }, { quoted: msg });
      return;
    }

    // Sync history to avoid missing messages
    await sock.fetchMessageHistory(50, repliedMsg.key, repliedMsg.messageTimestamp);

    const purgeAll = args[0] === 'all';
    const purgeCount = purgeAll ? 999999 : parseInt(args[0] || '1') + 1;

    const targetMessages = await messagesCollection.find({
      'key.remoteJid': jid,
      'messageTimestamp': { $gte: repliedMsg.messageTimestamp },
    })
      .sort({ messageTimestamp: 1 })
      .limit(purgeCount)
      .toArray();
    
      const allMessagesToDelete = [...targetMessages, msg];

      for (const message of allMessagesToDelete) {

      const key = message.key;

      try {

        await new Promise(r => setTimeout(r, 500));
        
        if (key.fromMe) {
          await sock.chatModify(
            {
              deleteForMe: {
                deleteMedia: true,
                key: {
                  id: key.id,
                  remoteJid: jid,
                  fromMe: true,
                },
                timestamp: Number(message.messageTimestamp),
              },
            },
            jid
          );
        } else {
          await sock.chatModify(
            {
              deleteForMe: {
                deleteMedia: true,
                key: {
                  id: key.id,
                  remoteJid: jid,
                  fromMe: false,
                },
                timestamp: Number(message.messageTimestamp),
              },
            },
            jid
          );
        }
      } catch (err) {
        console.log("Purge failed: " + err);
      }
    }
  }
};
