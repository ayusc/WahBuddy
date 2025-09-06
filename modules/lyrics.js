import fetch from 'node-fetch';

export default {
  name: ['.lyrics'],
  description: 'Fetches song lyrics from an online source',
  usage: 'Use .lyrics <song title> to retrieve lyrics.',

  async execute(msg, args, sock) {
    const query = args.join(' ');
    const jid = msg.key.remoteJid;

    if (!query) {
      await sock.sendMessage(
        jid,
        { text: 'Please provide the name of a song.\nExample: .lyrics Shape of You' },
        { quoted: msg }
      );
      return;
    }

    try {
      const apiUrl = `https://lyricsapi.fly.dev/api/lyrics?q=${encodeURIComponent(query)}`;
      const res = await fetch(apiUrl);

      if (!res.ok) {
        throw new Error(await res.text());
      }

      const data = await res.json();
      const lyrics = data?.result?.lyrics || null;

      if (!lyrics) {
        await sock.sendMessage(
          jid,
          { text: `No lyrics were found for: "${query}"` },
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
        { text: `Something went wrong while trying to get lyrics for "${query}".` },
        { quoted: msg }
      );
    }
  },
};
