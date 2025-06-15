export default {
  name: '.flip',
  description: 'Flips the input text upside down',
  usage: '.flip [text] (or reply to a message)',

  async execute(msg, args, sock) {
    const jid = msg.key.remoteJid;

    // Try to get text from arguments or replied message
    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const quotedText = quoted?.conversation || quoted?.extendedTextMessage?.text;
    const text = args.length ? args.join(" ") : quotedText;

    if (!text) {
      return sock.sendMessage(jid, { text: "Give me some text to flip or reply to a message." }, { quoted: msg });
    }

    const REPLACEMENT_MAP = {
      "a": "ɐ", "b": "q", "c": "ɔ", "d": "p", "e": "ǝ", "f": "ɟ", "g": "ƃ", "h": "ɥ",
      "i": "ᴉ", "j": "ɾ", "k": "ʞ", "l": "l", "m": "ɯ", "n": "u", "o": "o", "p": "d",
      "q": "b", "r": "ɹ", "s": "s", "t": "ʇ", "u": "n", "v": "ʌ", "w": "ʍ", "x": "x",
      "y": "ʎ", "z": "z", "A": "∀", "B": "B", "C": "Ɔ", "D": "D", "E": "Ǝ", "F": "Ⅎ",
      "G": "פ", "H": "H", "I": "I", "J": "ſ", "K": "K", "L": "˥", "M": "W", "N": "N",
      "O": "O", "P": "Ԁ", "Q": "Q", "R": "R", "S": "S", "T": "┴", "U": "∩", "V": "Λ",
      "W": "M", "X": "X", "Y": "⅄", "Z": "Z", "0": "0", "1": "Ɩ", "2": "ᄅ", "3": "Ɛ",
      "4": "ㄣ", "5": "ϛ", "6": "9", "7": "ㄥ", "8": "8", "9": "6", ",": "'", ".": "˙",
      "?": "¿", "!": "¡", '"': ",,", "'": ",", "(": ")", ")": "(", "[": "]", "]": "[",
      "{": "}", "}": "{", "<": ">", ">": "<", "&": "⅋", "_": "‾"
    };

    let flipped = "";
    for (let i = text.length - 1; i >= 0; i--) {
      const char = text[i];
      flipped += REPLACEMENT_MAP[char] || char;
    }

    await sock.sendMessage(jid, { text: flipped }, { quoted: msg });
  }
};

