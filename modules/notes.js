import { db } from '../main.js';
import { downloadMediaMessage } from '@whiskeysockets/baileys';

let notesCollection;
function setupNotesCollection() {
  if (!notesCollection) {
    notesCollection = db.collection('notes');
  }
}

export default [
  {
    name: '.save',
    description: 'Save a note (text/media) by name.',
    usage: '.save <name> [text or reply to message]',
    async execute(msg, args, sock) {
      setupNotesCollection();
      const jid = msg.key.remoteJid;

      if (!args[0]) {
        await sock.sendMessage(jid, {
          text: 'Please provide a note name.\n\nExample: `.save hi hello`',
        }, { quoted: msg });
        return;
      }

      const name = args[0].toLowerCase();
      const existing = await notesCollection.findOne({ name, jid });

      if (existing) {
        await sock.sendMessage(jid, { text: `Note "${name}" already exists in this chat.` }, { quoted: msg });
        return;
      }

      const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
      let content = null;
      let media = null;

      if (quoted) {
        const text = quoted?.conversation || quoted?.extendedTextMessage?.text || quoted?.imageMessage?.caption || quoted?.videoMessage?.caption;
        if (text) content = text.trim();

        const type = Object.keys(quoted)[0];
        const hasMedia = ['imageMessage', 'videoMessage', 'audioMessage', 'stickerMessage', 'documentMessage'].includes(type);
        if (hasMedia) {
          const buffer = await downloadMediaMessage(
            { message: quoted },
            'buffer',
            {},
            { logger: console, reuploadRequest: sock.updateMediaMessage }
          );

          media = {
            type,
            mimetype: quoted[type].mimetype || null,
            data: buffer,
          };
        }

        if (!content && !media) {
          await sock.sendMessage(jid, { text: 'Cannot save empty or unsupported message.' }, { quoted: msg });
          return;
        }
      } else if (args.length > 1) {
        content = args.slice(1).join(' ').trim();
      } else {
        await sock.sendMessage(jid, {
          text: 'Please reply to a message or provide text.\n\nExample: `.save hi hello`',
        }, { quoted: msg });
        return;
      }

      await notesCollection.insertOne({ name, jid, content, media, createdAt: new Date() });

      await sock.sendMessage(jid, { text: `Note "${name}" saved.` }, { quoted: msg });
    },
  },

  {
    name: '.note',
    description: 'Send a saved note.',
    usage: '.note <name>',
    async execute(msg, args, sock) {
      setupNotesCollection();
      const jid = msg.key.remoteJid;

      if (!args[0]) {
        await sock.sendMessage(jid, {
          text: 'Usage: `.note <name>`\n\nExample: `.note hi`',
        }, { quoted: msg });
        return;
      }

      const name = args[0].toLowerCase();
      const note = await notesCollection.findOne({ name, jid });

      if (!note) {
        await sock.sendMessage(jid, { text: `Note "${name}" not found in this chat.` }, { quoted: msg });
        return;
      }

      if (note.media) {
        const options = { quoted: msg };
        const data = note.media.data.buffer; // BSON binary

        switch (note.media.type) {
          case 'imageMessage':
            await sock.sendMessage(jid, { image: data, caption: note.content || '', ...options });
            break;
          case 'videoMessage':
            await sock.sendMessage(jid, { video: data, caption: note.content || '', gifPlayback: note.media.mimetype === 'image/gif', ...options });
            break;
          case 'audioMessage':
            await sock.sendMessage(jid, { audio: data, mimetype: 'audio/mpeg', ...options });
            break;
          case 'stickerMessage':
            await sock.sendMessage(jid, { sticker: data, ...options });
            break;
          case 'documentMessage':
            await sock.sendMessage(jid, { document: data, fileName: `${name}.bin`, mimetype: note.media.mimetype || 'application/octet-stream', ...options });
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
        await sock.sendMessage(jid, { text: 'No saved notes in this chat.' }, { quoted: msg });
        return;
      }

      const list = notes.map(n => `• ${n.name}`).join('\n');
      await sock.sendMessage(jid, { text: `*Saved Notes:*\n\n${list}` }, { quoted: msg });
    },
  },

  {
    name: '.clear',
    description: 'Delete a specific note by name.',
    usage: '.clear <name>',
    async execute(msg, args, sock) {
      setupNotesCollection();
      const jid = msg.key.remoteJid;

      if (!args[0]) {
        await sock.sendMessage(jid, {
          text: 'Usage: `.clear <name>`\n\nExample: `.clear hi`',
        }, { quoted: msg });
        return;
      }

      const name = args[0].toLowerCase();
      const result = await notesCollection.deleteOne({ name, jid });

      if (result.deletedCount > 0) {
        await sock.sendMessage(jid, { text: `Note "${name}" deleted.` }, { quoted: msg });
      } else {
        await sock.sendMessage(jid, { text: `No note named "${name}" in this chat.` }, { quoted: msg });
      }
    },
  },

  {
    name: '.clearnotes',
    description: 'Delete all saved notes in this chat.',
    usage: '.clearnotes',
    async execute(msg, _args, sock) {
      setupNotesCollection();
      const jid = msg.key.remoteJid;

      const result = await notesCollection.deleteMany({ jid });

      if (result.deletedCount > 0) {
        await sock.sendMessage(jid, { text: `Cleared ${result.deletedCount} notes from this chat.` }, { quoted: msg });
      } else {
        await sock.sendMessage(jid, { text: 'There are no notes to clear in this chat.' }, { quoted: msg });
      }
    },
  },
];
