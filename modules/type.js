export default {
  name: '.type',
  description: 'Simulates typing effect like a typewriter',
  usage: '.type [text] (or reply to a message)',

  async execute(msg, args, sock) {
    const jid = msg.key.remoteJid;

    // Try to get text from arguments or replied message
    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const quotedText = quoted?.conversation || quoted?.extendedTextMessage?.text;
    const text = args.length ? args.join(" ") : quotedText;

    if (!text) {
      return sock.sendMessage(jid, { text: "Give me something to type or reply to a text message." }, { quoted: msg });
    }

    let typed = "";
    const typingSymbol = "|";
    const SLEEP = 200;
    const delay = ms => new Promise(res => setTimeout(res, ms));

    // Send initial message
    const sent = await sock.sendMessage(jid, { text: typingSymbol }, { quoted: msg });

    for (const char of text) {
      await sock.sendMessage(jid, { text: typed + typingSymbol, edit: sent.key });
      await delay(SLEEP);
      typed += char;
      await sock.sendMessage(jid, { text: typed, edit: sent.key });
      await delay(SLEEP);
    }
  }
};
