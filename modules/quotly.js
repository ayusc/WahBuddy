// WahBuddy WhatsApp Userbot - Full .quote / .q Support (Enhanced)
// Based on Telegram userbot functionality with full feature parity

import axios from 'axios';
import sharp from 'sharp';
import { messagesCollection, contactsCollection } from '../main.js';
import { getContentType, downloadContentFromMessage } from 'baileys';

const fallbackAvatar = 'https://i.ibb.co/d4qcHwdj/blank-profile-picture-973460-1280.png';

export default {
  name: ['.quote', '.q'],
  description: 'Generate a styled quote sticker from WhatsApp messages',
  usage: '.q [1-15] [!png] [!me] [!noreply]',

  async execute(msg, args, sock) {
    const jid = msg.key.remoteJid;
    const quoted = msg.message?.extendedTextMessage?.contextInfo;
    const countArg = args.find((a) => /^\d+$/.test(a));
    const count = Math.max(1, Math.min(Number(countArg || 1), 15));
    const flags = {
      png: args.includes('!png') || args.includes('!file'),
      toMe: args.includes('!me') || args.includes('!ls'),
      noReply: args.includes('!noreply') || args.includes('!nr'),
    };

    if (!quoted?.stanzaId) {
      return await sock.sendMessage(jid, { text: 'Reply to a message to quote it.' }, { quoted: msg });
    }

    const all = await messagesCollection
      .find({ 'key.remoteJid': jid })
      .sort({ 'messageTimestamp': 1 })
      .toArray();
    const startIndex = all.findIndex((m) => m.key.id === quoted.stanzaId);
    if (startIndex === -1) return await sock.sendMessage(jid, { text: 'Cannot find message in history.' }, { quoted: msg });

    const slice = all.slice(startIndex, startIndex + count).filter((m) => !!m.message);
    const rendered = await Promise.all(slice.map((m) => renderMessage(sock, m, flags.noReply)));

    const quoteReq = {
      messages: rendered,
      quote_color: '#162330',
      text_color: '#fff',
    };

    try {
      const res = await axios.post('https://quotes.fl1yd.su/generate', quoteReq, { responseType: 'arraybuffer' });
      const sticker = await sharp(res.data)
        .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .toFormat(flags.png ? 'png' : 'webp')
        .toBuffer();

      const target = flags.toMe ? 'status@broadcast' : jid;
      const content = flags.png ? { document: sticker, mimetype: 'image/png', fileName: 'quote.png' } : { sticker };
      await sock.sendMessage(target, content);
    } catch (err) {
      console.error('Quote error:', err);
      await sock.sendMessage(jid, { text: 'Error generating quote.' }, { quoted: msg });
    }
  },
};

async function renderMessage(sock, msg, noReply) {
  const id = msg.key.fromMe ? sock.user.id : msg.key.participant || msg.key.remoteJid;
  const text = getReplyText(msg);
  const avatar = await getProfilePic(sock, id);
  const author = {
    id: 1,
    name: await getName(sock, id),
    photo: avatar ? { url: avatar } : undefined,
    rank: '',
    via_bot: '',
  };

  let reply = {};
  const ctx = msg.message?.extendedTextMessage?.contextInfo;
  if (!noReply && ctx?.quotedMessage) {
    const qid = ctx.participant || msg.key.remoteJid;
    const qname = await getName(sock, qid);
    const qtext = getReplyText({ message: ctx.quotedMessage });
    if (qtext) reply = { id: 0, name: qname, text: qtext };
  }

  const media = await getMediaBase64(sock, msg);
  return { text, media, entities: [], author, reply };
}

function getReplyText(msg) {
  const m = msg.message;
  if (!m) return '';

  if (m.protocolMessage) return '[Action message]';
  if (m.audioMessage) return '🎧 Music';
  if (m.voiceMessage) return '🎵 Voice';
  if (m.videoMessage) return '📹 Video';
  if (m.imageMessage) return '📷 Photo' + (m.imageMessage.caption ? `\n${m.imageMessage.caption}` : '');
  if (m.stickerMessage) return (m.stickerMessage.emoji || '') + ' Sticker';
  if (m.contactMessage) return '👤 Contact';
  if (m.locationMessage) return '📍 Location';
  if (m.liveLocationMessage) return '📍 Live Location';
  if (m.documentMessage) return '💾 File ' + (m.documentMessage?.fileName || '');
  if (m.pollCreationMessage) {
    const poll = m.pollCreationMessage;
    const q = `📊 Poll${poll.isAnonymous ? ' (anonymous)' : ''}`;
    const options = poll.options?.map(opt => `- ${opt.optionName}`).join('\n') || '';
    return `${q}\n${poll.name}\n${options}`;
  }
  if (m.conversation) return m.conversation;
  if (m.extendedTextMessage?.text) return m.extendedTextMessage.text;
  return '[unsupported message]';
}

async function getMediaBase64(sock, msg) {
  const type = getContentType(msg.message);
  if (!['imageMessage', 'stickerMessage'].includes(type)) return '';
  try {
    const stream = await downloadContentFromMessage(msg.message[type], type.startsWith('image') ? 'image' : 'sticker');
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    return Buffer.concat(chunks).toString('base64');
  } catch {
    return '';
  }
}

async function getProfilePic(sock, id) {
  try {
    return await sock.profilePictureUrl(id, 'image');
  } catch {
    return fallbackAvatar;
  }
}

function normalizeJid(jid) {
  return jid.replace(/:\d+@/, '@');
}

async function getName(sock, id) {
  const jid = normalizeJid(id.includes('@') ? id : `${id}@s.whatsapp.net`);
  if (jid === normalizeJid(sock.user.id)) return sock.user?.name || `+${jid.split('@')[0]}`;
  const c = await contactsCollection.findOne({ id: jid });
  return c?.name || c?.notify || c?.pushName || `+${jid.split('@')[0]}`;
}
