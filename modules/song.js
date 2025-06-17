import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';

export default {
  name: '.song',
  description: 'Searches and sends a song from Saavn as an MP3.',
  usage: '.song <song name>',

  async execute(msg, _args, sock) {
    const jid = msg.key.remoteJid;
    const query = _args.join(' ').trim();

    if (!query) {
      return await sock.sendMessage(jid, { text: 'Please enter a song name to download.' });
    }

    try {
      const progressMsg = await sock.sendMessage(jid, { text: `Searching for "${query}" on Saavn...` }, { quoted: msg });

      const res = await fetch(`https://rsjiprivate-api.vercel.app/api/search/songs?query=${encodeURIComponent(query)}`);
      const json = await res.json();

      if (!json.success || !json.data?.results?.length) {
        return await sock.sendMessage(jid, { text: `No results found for "${query}".`, edit: progressMsg.key }, { quoted: msg });
      }

      const song = json.data.results[0];
      const songName = song.name;
      const songUrl = song.downloadUrl?.slice(-1)[0]?.url;
      const thumbUrl = song.image?.slice(-1)[0]?.url;

      if (!songUrl) {
        return await sock.sendMessage(jid, { text: 'Failed to get a valid download URL.', edit: progressMsg.key }, { quoted: msg });
      }

      const tempDir = path.resolve('./temp');
      if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

      const timeStamp = Date.now();
      const audioPath = path.join(tempDir, `${timeStamp}.mp3`);
      const thumbPath = path.join(tempDir, `${timeStamp}.jpg`);

      const audioBuffer = await fetch(songUrl).then(r => r.buffer());
      fs.writeFileSync(audioPath, audioBuffer);

      if (thumbUrl) {
        const thumbBuffer = await fetch(thumbUrl).then(r => r.buffer());
        fs.writeFileSync(thumbPath, thumbBuffer);
      }

      await sock.sendMessage(jid, { text: `Uploading "${songName}"...`, edit: progressMsg.key }, { quoted: msg });

      await sock.sendMessage(jid, {
        audio: { url: audioPath },
        mimetype: 'audio/mpeg',
        fileName: `${songName}.mp3`,
        ptt: false,
        contextInfo: {
          externalAdReply: {
            title: songName,
            body: 'From Saavn',
            thumbnailUrl: thumbUrl,
            mediaType: 1,
            renderLargerThumbnail: true,
            sourceUrl: songUrl
          }
        }
      }, { quoted: msg });

      await sock.sendMessage(jid, {
        delete: {
          remoteJid: jid,
          fromMe: true,
          id: progressMsg.key.id
        }
      });

      [audioPath, thumbPath].forEach(f => fs.existsSync(f) && fs.unlinkSync(f));

    } catch (err) {
      console.error('Song command error:', err);
      await sock.sendMessage(jid, {
        text: 'Failed to download or send the song. Please try again later.',
      }, { quoted: msg });
    }
  }
};
