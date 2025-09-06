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
  name: ['.hearts'],
  description: 'Sends an animated heart animation',
  usage: 'Send .hearts in any chat to show a colourful heart animation',

  async execute(msg, _args, sock) {
    const jid = msg.key.remoteJid;
    const SLEEP = 200;

    const R = '❤️';
    const W = '🤍';
    const ALL = ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤎'];
    const BIG_SCROLL = ['🧡', '💛', '💚', '💙', '💜', '🖤', '🤎'];

    const heartList = [
      W.repeat(9),
      W.repeat(2) + R.repeat(2) + W + R.repeat(2) + W.repeat(2),
      W + R.repeat(7) + W,
      W + R.repeat(7) + W,
      W + R.repeat(7) + W,
      W.repeat(2) + R.repeat(5) + W.repeat(2),
      W.repeat(3) + R.repeat(3) + W.repeat(3),
      W.repeat(4) + R + W.repeat(4),
      W.repeat(9),
    ];

    const joinedHeart = heartList.join('\n');

    const delay = ms => new Promise(res => setTimeout(res, ms));

    const delid = await sock.sendMessage(jid, { delete: msg.key });

    await sock.chatModify(
      {
        deleteForMe: {
          deleteMedia: true,
          key: {
            id: delid.key.id,
            remoteJid: jid,
            fromMe: true,
          },
          timestamp: Number(delid.messageTimestamp),
        },
      },
      jid
    );

    const sent = await sock.sendMessage(jid, { text: joinedHeart });

    for (let heart of BIG_SCROLL) {
      const newText = joinedHeart.replace(/❤️/g, heart);
      await sock.sendMessage(jid, { text: newText, edit: sent.key });
      await delay(SLEEP);
    }

    const formatHeart = joinedHeart.replace(/❤️/g, '{}');
    for (let i = 0; i < 5; i++) {
      const filled = formatHeart.replace(
        /\{\}/g,
        () => ALL[Math.floor(Math.random() * ALL.length)]
      );
      await sock.sendMessage(jid, { text: filled, edit: sent.key });
      await delay(SLEEP);
    }

    let fillMatrix = joinedHeart;
    const totalWhites = (fillMatrix.match(/🤍/g) || []).length;

    for (let i = 0; i < totalWhites; i++) {
      fillMatrix = fillMatrix.replace('🤍', '❤️');
      await sock.sendMessage(jid, { text: fillMatrix, edit: sent.key });
      await delay(SLEEP);
    }

    for (let i = 7; i > 0; i--) {
      const shrink = Array(i).fill(R.repeat(i)).join('\n');
      await sock.sendMessage(jid, { text: shrink, edit: sent.key });
      await delay(SLEEP);
    }
  },
};
