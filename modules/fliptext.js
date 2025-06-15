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
  name: '.flip',
  description: 'Turns text upside-down by flipping each letter (order unchanged)',
  usage: '.flip [text] – or reply to a message',

  async execute(msg, args, sock) {
    const jid = msg.key.remoteJid;

    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const quotedText =
      quoted?.conversation ||
      quoted?.extendedTextMessage?.text ||
      quoted?.ephemeralMessage?.message?.conversation;
    const text = args.length ? args.join(" ") : quotedText;

    if (!text) {
      return sock.sendMessage(
        jid,
        { text: "Give me some text to flip, or reply to a message." },
        { quoted: msg }
      );
    }

    const M = {
      a:'ɐ', b:'q', c:'ɔ', d:'p', e:'ǝ', f:'ɟ', g:'ƃ', h:'ɥ',
      i:'ᴉ', j:'ɾ', k:'ʞ', l:'ʃ', m:'ɯ', n:'u', o:'o', p:'d',
      q:'b', r:'ɹ', s:'s', t:'ʇ', u:'n', v:'ʌ', w:'ʍ', x:'x',
      y:'ʎ', z:'z',

      A:'∀', B:'𐐒', C:'Ɔ', D:'ᗡ', E:'Ǝ', F:'Ⅎ', G:'פ', H:'H',
      I:'I', J:'ſ', K:'ʞ', L:'˥', M:'W', N:'N', O:'O', P:'Ԁ',
      Q:'Ό', R:'ᴚ', S:'S', T:'┴', U:'∩', V:'Λ', W:'M', X:'X',
      Y:'⅄', Z:'Z',

      0:'0', 1:'Ɩ', 2:'ᄅ', 3:'Ɛ', 4:'ㄣ', 5:'ϛ', 6:'9', 7:'ㄥ',
      8:'8', 9:'6',

      ',':"'", '.':'˙', '?':'¿', '!':'¡', '"':',,', "'":',',
      '(':')', ')':'(', '[':']', ']':'[', '{':'}', '}':'{',
      '<':'>', '>':'<', '&':'⅋', '_':'‾'
    };

    const flipped = [...text]
      .map(ch => M[ch] || ch)
      .join('');

    await sock.sendMessage(jid, { text: flipped }, { quoted: msg });
  }
};
