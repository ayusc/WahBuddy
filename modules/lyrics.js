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

export default {
  name: ['.lyrics'],
  description: 'Fetches song lyrics from an online source',
  usage: 'Use .lyrics <song title> to retrieve lyrics.',

  async execute(msg, args, sock) {
    const query = args.join(' ');
    const jid = msg.key.remoteJid;

    if (!query) {
      await sock.sendMessage(
        jid,
        { text: 'Please provide the name of a song.\nExample: .lyrics Shape of You' },
        { quoted: msg }
      );
      return;
    }

    try {
      const apiUrl = `https://lyricsapi.fly.dev/api/lyrics?q=${encodeURIComponent(query)}`;
      const res = await fetch(apiUrl);

      if (!res.ok) {
        throw new Error(await res.text());
      }

      const data = await res.json();
      const lyrics = data?.result?.lyrics || null;

      if (!lyrics) {
        await sock.sendMessage(
          jid,
          { text: `No lyrics were found for: "${query}"` },
          { quoted: msg }
        );
        return;
      }

      const maxChars = 4000;
      const output = lyrics.length > maxChars ? lyrics.slice(0, maxChars - 3) + '...' : lyrics;

      await sock.sendMessage(jid, { text: output }, { quoted: msg });
    } catch (err) {
      console.error('Lyrics command error:', err);
      await sock.sendMessage(
        jid,
        { text: `Something went wrong while trying to get lyrics for "${query}".` },
        { quoted: msg }
      );
    }
  },
};
