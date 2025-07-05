import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { db } from '../main.js';
import { downloadMediaMessage } from 'baileys';

let notesCollection;
function setupNotesCollection() {
  if (!notesCollection) {
    notesCollection = db.collection('notes');
  }
}

function generateFileName(jid, name, ext) {
  const hash = crypto.createHash('md5').update(jid + name).digest('hex');
  return `${hash}.${ext}`;
}

async function saveMedia(msg, sock, name, jid) {
  const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
  const type = Object.keys(quoted || {})[0]; // e.g. 'imageMessage', 'audioMessage'
  const media = quoted[type];

  const buffer = await downloadMediaMessage(
    { key: msg.message.extendedTextMessage.contextInfo.stanzaId, message: quoted },
    'buffer',
    {},
    { logger: console, reuploadRequest: sock.updateMediaMessage }
  );

  const extMap = {
    imageMessage: 'jpg',
    videoMessage: media.gifPlayback ? 'gif' : 'mp4',
    audioMessage: 'mp3',
    stickerMessage: 'webp',
    documentMessage: media.fileName?.split('.').pop() || 'bin',
  };
  const ext = extMap[type] || 'bin';

  const filename = generateFileName(jid, name, ext);
  const filePath = path.join('./notes_media/', filename);
  fs.writeFileSync(filePath, buffer);

  return { path: filePath, type };
}

export default [
  {
    name: '.save',
    description: 'Save a note by replying or passing text or media.',
    usage: '.save <name> [text or reply to message]',
    async execute(msg, args, sock) {
      setupNotesCollection();
      const jid = msg.key.remoteJid;

      if (!args[0]) {
        await sock.sendMessage(jid, { text: 'Please provide a note name.\n\nExample: `.save hi hello`' }, { quoted: msg });
        return;
      }

      const name = args[0].toLowerCase();
      const existing = await notesCollection.findOne({ name, jid });
      if (existing) {
        await sock.sendMessage(jid, { text: `Note "${name}" already exists in this chat.` }, { quoted: msg });
        return;
      }

      let content = null;
      let media = null;

      const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
      if (quoted) {
        const text = quoted?.conversation || quoted?.extendedTextMessage?.text || quoted?.imageMessage?.caption || quoted?.videoMessage?.caption;
        if (text) content = text.trim();

        const mediaTypes = ['imageMessage', 'videoMessage', 'audioMessage', 'stickerMessage', 'documentMessage'];
        const hasMedia = mediaTypes.find(t => quoted[t]);
        if (hasMedia) {
          media = await saveMedia(msg, sock, name, jid);
        }

        if (!content && !media) {
          await sock.sendMessage(jid, { text: 'Cannot save an empty or unsupported message.' }, { quoted: msg });
          return;
        }
      } else if (args.length > 1) {
        content = args.slice(1).join(' ').trim();
      } else {
        await sock.sendMessage(jid, { text: 'Reply to a message or provide text.\n\nExample: `.save hi hello`' }, { quoted: msg });
        return;
      }

      await notesCollection.insertOne({ name, jid, content, media, createdAt: new Date() });
      await sock.sendMessage(jid, { text: `Note "${name}" saved successfully.` }, { quoted: msg });
    },
  },

  {
    name: '.get',
    description: 'Send a saved note.',
    usage: '.get <name>',
    async execute(msg, args, sock) {
      setupNotesCollection();
      const jid = msg.key.remoteJid;
      if (!args[0]) {
        await sock.sendMessage(jid, { text: 'Usage: `.note <name>`\n\nExample: `.note hi`' }, { quoted: msg });
        return;
      }

      const name = args[0].toLowerCase();
      const note = await notesCollection.findOne({ name, jid });

      if (!note) {
        await sock.sendMessage(jid, { text: `Note "${name}" not found in this chat.` }, { quoted: msg });
        return;
      }

      if (note.media) {
        const stream = fs.readFileSync(note.media.path);
        const options = { caption: note.content || '', quoted: msg };

        switch (note.media.type) {
          case 'imageMessage':
            await sock.sendMessage(jid, { image: stream, ...options });
            break;
          case 'videoMessage':
            await sock.sendMessage(jid, { video: stream, gifPlayback: note.media.path.endsWith('.gif'), ...options });
            break;
          case 'audioMessage':
            await sock.sendMessage(jid, { audio: stream, mimetype: 'audio/mpeg', ...options });
            break;
          case 'stickerMessage':
            await sock.sendMessage(jid, { sticker: stream, ...options });
            break;
          case 'documentMessage':
            await sock.sendMessage(jid, { document: stream, fileName: path.basename(note.media.path), ...options });
            break;
          default:
            await sock.sendMessage(jid, { text: 'Unknown media type.' }, { quoted: msg });
        }
      } else {
        await sock.sendMessage(jid, { text: note.content }, { quoted: msg });
      }
    },
  },

  {
    name: '.notes',
    description: 'List all saved notes in this chat.',
    usage: '.notes',
    async execute(msg, _args, sock) {
      setupNotesCollection();
      const jid = msg.key.remoteJid;
      const notes = await notesCollection.find({ jid }).toArray();

      if (!notes.length) {
        await sock.sendMessage(jid, { text: 'No saved notes found in this chat.' }, { quoted: msg });
        return;
      }

      const list = notes.map(n => `• ${n.name}`).join('\n');
      await sock.sendMessage(jid, { text: `*Saved Notes:*\n\n${list}` }, { quoted: msg });
    },
  },

  {
    name: '.clear',
    description: 'Delete a saved note.',
    usage: '.clear <name>',
    async execute(msg, args, sock) {
      setupNotesCollection();
      const jid = msg.key.remoteJid;
      if (!args[0]) {
        await sock.sendMessage(jid, { text: 'Usage: `.clear <name>`\n\nExample: `.clear hi`' }, { quoted: msg });
        return;
      }

      const name = args[0].toLowerCase();
      const note = await notesCollection.findOne({ name, jid });

      if (!note) {
        await sock.sendMessage(jid, { text: `No note found with name "${name}".` }, { quoted: msg });
        return;
      }

      if (note.media?.path && fs.existsSync(note.media.path)) {
        fs.unlinkSync(note.media.path);
      }

      await notesCollection.deleteOne({ name, jid });
      await sock.sendMessage(jid, { text: `Note "${name}" deleted.` }, { quoted: msg });
    },
  },
];
