import { db } from '../main.js';

const collectionName = 'afk';
let afkCollection;

// Setup collection (only once)
function setupAfkCollection() {
  if (!afkCollection) {
    afkCollection = db.collection(collectionName);
  }
}

// Command module
export default {
  name: '.afk',
  description: 'Sets or removes AFK status with optional reason.',
  usage: '.afk on/yes [reason] | .afk off/no',

  async execute(msg, args, sock) {
    setupAfkCollection();

    const jid = msg.key.participant || msg.key.remoteJid;
    const senderId = msg.key.participant || msg.key.remoteJid.split('@')[0];

    const subCommand = (args[0] || '').toLowerCase();

    if (subCommand === 'on' || subCommand === 'yes') {
      const reason = args.slice(1).join(' ') || 'No reason provided';
      const afkData = {
        user: senderId,
        isafk: true,
        afkreason: reason,
        afktime: new Date(),
      };

      await afkCollection.updateOne(
        { user: senderId },
        { $set: afkData },
        { upsert: true }
      );

      await sock.sendMessage(jid, { text: `You are now AFK.\nReason: ${reason}` }, { quoted: msg });
    } else if (subCommand === 'off' || subCommand === 'no') {
      await afkCollection.updateOne(
        { user: senderId },
        { $set: { isafk: false } },
        { upsert: true }
      );

      await sock.sendMessage(jid, { text: `Welcome back!\nYou are no longer AFK.` }, { quoted: msg });
    } else {
      await sock.sendMessage(jid, {
        text: `Usage:\n.afk on/yes [reason] - set AFK status\n.afk off/no - remove AFK status`,
      }, { quoted: msg });
    }
  },
};

export async function handleAfkMessages(msg, sock) {
  setupAfkCollection();

  // Skip own messages
  if (msg.key.fromMe) return;

  const myId = sock.user.id.split(':')[0] + '@s.whatsapp.net';

  const afkData = await afkCollection.findOne({
    user: sock.user.id.split(':')[0],
    isafk: true,
  });

  if (!afkData) return;

  const reason = afkData.afkreason || 'No reason provided';
  const afkDate = new Date(afkData.afktime);
  const time = afkDate.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

  const isGroup = msg.key.remoteJid.endsWith('@g.us');
  let shouldRespond = false;

  if (isGroup) {
    const mentionedJids = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];

    if (mentionedJids.includes(myId)) {
      shouldRespond = true;
    }
    
    const repliedParticipant = msg.message?.extendedTextMessage?.contextInfo?.participant;
    const repliedStanzaId = msg.message?.extendedTextMessage?.contextInfo?.stanzaId;

    if (repliedParticipant === myId || repliedStanzaId) {
      shouldRespond = true;
    }
  } else {
    // It’s a DM, so respond always
    shouldRespond = true;
  }

  if (shouldRespond) {
    await sock.sendMessage(msg.key.remoteJid, {
      text: `*I am AFK!*\nReason: ${reason}\nSince: ${time}`,
    }, { quoted: msg });
  }
}
