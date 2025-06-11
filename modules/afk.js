import { db } from '../main.js';

const collectionName = 'afk';
let afkCollection;

function setupAfkCollection() {
  if (!afkCollection) {
    afkCollection = db.collection(collectionName);
  }
}

export default {
  name: '.afk',
  description: 'Sets or removes AFK status with optional reason.',
  usage: '.afk on/yes [reason] | .afk off/no',

  async execute(msg, args, sock) {
    setupAfkCollection();

    const jid = msg.key.participant || msg.key.remoteJid;

    const subCommand = (args[0] || '').toLowerCase();

    if (subCommand === 'on' || subCommand === 'yes') {
      const reason = args.slice(1).join(' ') || 'No reason provided';
      const afkData = {
        isafk: true,
        afkreason: reason,
        afktime: new Date(),
      };

      await afkCollection.updateOne(
        {}, // single document, no filter
        { $set: afkData },
        { upsert: true }
      );

      await sock.sendMessage(jid, { text: `You are now AFK.\nReason: ${reason}` }, { quoted: msg });
    } else if (subCommand === 'off' || subCommand === 'no') {
      await afkCollection.updateOne(
        {},
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

  if (msg.key.fromMe) return;

  const afkData = await afkCollection.findOne({ isafk: true });
  if (!afkData) return;

  const reason = afkData.afkreason || 'No reason';
  const afkDate = new Date(afkData.afktime);
  const now = new Date();

  let timeString;

  const hours = afkDate.getHours();
  const minutes = afkDate.getMinutes();
  const formattedTime = `${((hours % 12) || 12)
    .toString()
    .padStart(2, '0')}:${minutes.toString().padStart(2, '0')} ${hours >= 12 ? 'PM' : 'AM'}`;

  const afkDay = new Date(afkDate.getFullYear(), afkDate.getMonth(), afkDate.getDate());
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.floor((today - afkDay) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    timeString = `Today at ${formattedTime}`;
  } else if (diffDays === 1) {
    timeString = `Yesterday at ${formattedTime}`;
  } else if (diffDays <= 7) {
    const weekdays = [
      'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'
    ];
    const dayName = weekdays[afkDate.getDay()];
    timeString = `${dayName} at ${formattedTime}`;
  } else {
    const dateString = `${afkDate.getDate().toString().padStart(2, '0')}:${
      (afkDate.getMonth() + 1).toString().padStart(2, '0')
    }:${afkDate.getFullYear()}`;
    timeString = `${formattedTime} on ${dateString}`;
  }

  const isGroup = msg.key.remoteJid.endsWith('@g.us');
  let shouldRespond = false;

  const myId = sock.user.id.split(':')[0] + '@s.whatsapp.net';

  if (isGroup) {
    const mentionedJids = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
    const repliedParticipant = msg.message?.extendedTextMessage?.contextInfo?.participant;

    if (mentionedJids.includes(myId) || repliedParticipant === myId) {
      shouldRespond = true;
    }
  } else {
    shouldRespond = true;
  }

  if (shouldRespond) {
    await sock.sendMessage(msg.key.remoteJid, {
      text: `*I am AFK!*\nReason: ${reason}\nSince: ${timeString}`,
    }, { quoted: msg });
  }
}
