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

export default {
  name: ['.ping'],
  description: 'Replies with Pong and response time',
  usage: 'Type .ping in any chat to check bot status and response time.',

  async execute(msg, _args, sock) {
    const start = Date.now();
    const jid = msg.key.remoteJid;

    const sent = await sock.sendMessage(
      jid,
      { text: '*Pong !*' },
      { quoted: msg }
    );

    const timeTaken = ((Date.now() - start) / 1000).toFixed(3);

    await new Promise(resolve => setTimeout(resolve, 500));

    await sock.sendMessage(jid, {
      text: `*Pong !*\nResponse time: ${timeTaken}s`,
      edit: sent.key,
    });
  },
};
