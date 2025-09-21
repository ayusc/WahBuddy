//  WahBuddy - A simple whatsapp userbot written in pure js
//  Copyright (C) 2025-present Ayus Chatterjee
//
//  This program is free software: you can redistribute it and/or modify
//  it under the terms of the GNU General Public License as published by
//  the Free Software Foundation, either version 3 of the License, or
//  (at your option) any later version.

//  This program is distributed in the hope that it will be useful,
//  but WITHOUT ANY WARRANTY; without even the implied warranty of
//  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
//  GNU General Public License for more details.

//  You should have received a copy of the GNU General Public License
//  along with this program.  If not, see <https://www.gnu.org/licenses/>.

import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';

export default {
  name: ['.song'],
  description: 'Searches and sends a song from Saavn as an MP3.',
  usage: '.song <song name>',

  async execute(msg, _args, sock) {
    const jid = msg.key.remoteJid;
    const query = _args.join(' ').trim();

    if (!query) {
      return await sock.sendMessage(jid, {
        text: 'Please enter a song name to download.',
      });
    }

    try {
      const progressMsg = await sock.sendMessage(
        jid,
        { text: `Searching for "${query}" on Saavn...` },
        { quoted: msg }
      );

      const res = await fetch(
        `https://rsjiprivate-api.vercel.app/api/search/songs?query=${encodeURIComponent(query)}`
      );
      const json = await res.json();

      if (!json.success || !json.data?.results?.length) {
        return await sock.sendMessage(
          jid,
          { text: `No results found for "${query}".`, edit: progressMsg.key },
          { quoted: msg }
        );
      }

      const song = json.data.results[0];
      const songName = song.name;
      const songUrl = song.downloadUrl?.slice(-1)[0]?.url;
      const thumbUrl = song.image?.slice(-1)[0]?.url;

      if (!songUrl) {
        return await sock.sendMessage(
          jid,
          {
            text: 'Failed to get a valid download URL.',
            edit: progressMsg.key,
          },
          { quoted: msg }
        );
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

      await sock.sendMessage(
        jid,
        { text: `Uploading "${songName}"...`, edit: progressMsg.key },
        { quoted: msg }
      );

      await sock.sendMessage(
        jid,
        {
          audio: { url: audioPath },
          mimetype: 'audio/mpeg',
          fileName: `${songName}.mp3`,
          ptt: false,
          contextInfo: {
            externalAdReply: {
              title: songName,
              body: 'Uploaded From Saavn',
              thumbnailUrl: thumbUrl,
              mediaType: 1,
              renderLargerThumbnail: true,
            },
          },
        },
        { quoted: msg }
      );

      [audioPath, thumbPath].forEach(f => fs.existsSync(f) && fs.unlinkSync(f));
    } catch (err) {
      console.error('Song command error:', err);
      await sock.sendMessage(
        jid,
        {
          text: 'Failed to download or send the song. Please try again later.',
        },
        { quoted: msg }
      );
    }
  },
};
