export default {
  name: '.type',
  description: 'Simulates typing effect like a typewriter',
  usage: '.type <text>',

  async execute(msg, args, sock) {
    const jid = msg.key.remoteJid;
    const text = args.join(" ");
    if (!text) return sock.sendMessage(jid, { text: "Give me something to type!" }, { quoted: msg });

    let typed = "";
    const typingSymbol = "|";
    const SLEEP = 200; 

    const delay = ms => new Promise(res => setTimeout(res, ms));

    // Initial message
    let sent = await sock.sendMessage(jid, { text: typingSymbol }, { quoted: msg });

    for (const char of text) {
      await sock.sendMessage(jid, { text: typed + typingSymbol, edit: sent.key });
      await delay(SLEEP);
      typed += char;
      await sock.sendMessage(jid, { text: typed, edit: sent.key });
      await delay(SLEEP);
    }
  }
};
