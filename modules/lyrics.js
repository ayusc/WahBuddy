//  WahBuddy - A simple whatsapp userbot written in pure js
//  Copyright (C) 2025-present Ayus Chatterjee
//
//  This program is free software: you can redistribute it and/or modify
//  it under the terms of the GNU General Public License as published by
//  the Free Software Foundation, either version 3 of the License, or
//  (at your option) any later version.
//
//  This program is distributed in the hope that it will be useful,
//  but WITHOUT ANY WARRANTY; without even the implied warranty of
//  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
//  GNU General Public License for more details.
//
//  You should have received a copy of the GNU General Public License
//  along with this program.  If not, see <https://www.gnu.org/licenses/>.

import fetch from 'node-fetch';

export default {
  name: ['.lyrics'],
  description: 'Get lyrics for a song by providing artist and song name',
  usage: '.lyrics <song title> - <artist name>\n\nEg: .lyrics Shape of You - Ed Sheeran',

  async execute(msg, args, sock) {
    const query = args.join(' ');
    const jid = msg.key.remoteJid;

    if (!query.includes('-')) {
      await sock.sendMessage(
        jid,
        { text: 'Please provide both artist and song name.\nExample: .lyrics Ed Sheeran - Shape of You' },
        { quoted: msg }
      );
      return;
    }

    const [trackName, artistName] = query.split('-').map(str => str.trim());

    try {
      const apiUrl = `https://api.lyrics.ovh/v1/${encodeURIComponent(artistName)}/${encodeURIComponent(trackName)}`;
      const res = await fetch(apiUrl);

      if (!res.ok) {
        throw new Error(await res.text());
      }

      const data = await res.json();
      const lyrics = data?.lyrics || null;

      if (!lyrics) {
        await sock.sendMessage(
          jid,
          { text: `No lyrics were found for: "${trackName}" by "${artistName}"` },
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
        { text: `Something went wrong while fetching lyrics for "${trackName}" by "${artistName}".` },
        { quoted: msg }
      );
    }
  },
};
