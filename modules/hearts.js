// hearts.js
export default {
  name: '.hearts',
  description: 'Sends an animated heart animation',
  usage: 'Send .hearts in any chat to show a colourful heart animation',

  async execute(msg, _args, sock) {
    const jid = msg.key.remoteJid;
    const SLEEP = 100;

    const R = "❤️";
    const W = "🤍";
    const ALL = ["❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤎"];
    const BIG_SCROLL = ["🧡", "💛", "💚", "💙", "💜", "🖤", "🤎"];

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
    const joinedHeart = heartList.join("\n");
    const heartletLen = (joinedHeart.match(/❤️/g) || []).length;

    const delay = ms => new Promise(res => setTimeout(res, ms));

    // Send initial message
    const sent = await sock.sendMessage(jid, { text: joinedHeart }, { quoted: msg });

    // Phase 1: Big Scroll
    for (let heart of BIG_SCROLL) {
      const newText = joinedHeart.replace(/❤️/g, heart);
      await sock.sendMessage(jid, { text: newText, edit: sent.key });
      await delay(SLEEP);
    }

    // Phase 2: Randomize hearts
    const formatHeart = joinedHeart.replace(/❤️/g, "{}");
    for (let i = 0; i < 5; i++) {
      const filled = formatHeart.replace(/\{\}/g, () => ALL[Math.floor(Math.random() * ALL.length)]);
      await sock.sendMessage(jid, { text: filled, edit: sent.key });
      await delay(SLEEP);
    }

    // Phase 3: Fill up matrix
    let repl = joinedHeart;
    for (let i = 0; i < (repl.match(/🤍/g) || []).length; i++) {
      repl = repl.replace("🤍", "❤️");
      await sock.sendMessage(jid, { text: repl, edit: sent.key });
      await delay(SLEEP);
    }

    // Phase 4: Shrinking
    for (let i = 7; i > 0; i--) {
      const shrink = Array(i).fill(R.repeat(i)).join("\n");
      await sock.sendMessage(jid, { text: shrink, edit: sent.key });
      await delay(SLEEP);
    }

    // Final caption
    const finalText = _args.length ? _args.join(" ") : "💕 by your WhatsApp bot";
    await sock.sendMessage(jid, { text: finalText, edit: sent.key });
  }
};
