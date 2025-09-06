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

export default {
  name: ['.lyrics'],
  description: 'Get lyrics for a song by providing artist and song name',
  usage:
    '.lyrics <artist name> - <song title>\n\nEg: .lyrics Ed Sheeran - Shape of You',

  async execute(msg, args, sock) {
    const query = args.join(' ').trim();
    const jid = msg.key.remoteJid;

    if (!query.includes('-')) {
      await sock.sendMessage(
        jid,
        {
          text: 'Provide artist and song separated by "-". Example: .lyrics Ed Sheeran - Shape of You',
        },
        { quoted: msg }
      );
      return;
    }

    const [artistNameRaw, trackNameRaw] = query.split('-').map(s => s.trim());
    const artistName = artistNameRaw || '';
    const trackName = trackNameRaw || '';

    if (!artistName || !trackName) {
      await sock.sendMessage(
        jid,
        {
          text: 'Both artist and song are required. Example: .lyrics Ed Sheeran - Shape of You',
        },
        { quoted: msg }
      );
      return;
    }

    try {
      const apiUrl = `https://api.lyrics.ovh/v1/${artistName}/${trackName}`;
      const res = await fetch(apiUrl);
      const bodyText = await res.text();

      let data;
      try {
        data = JSON.parse(bodyText);
      } catch {
        data = {};
      }

      const lyrics = data?.lyrics || null;

      if (!res.ok || !lyrics) {
        await sock.sendMessage(
          jid,
          { text: `No lyrics found for "${artistName} - ${trackName}"` },
          { quoted: msg }
        );
        return;
      }

      await sock.sendMessage(jid, { text: lyrics }, { quoted: msg });
    } catch (err) {
      await sock.sendMessage(
        jid,
        {
          text: `Error while fetching lyrics for "${artistName} - ${trackName}"`,
        },
        { quoted: msg }
      );
    }
  },
};
