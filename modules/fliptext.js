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
