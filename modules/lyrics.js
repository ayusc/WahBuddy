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

import fetch from "node-fetch";
import crypto from "crypto";
import base64url from "base64url";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.0.0 Safari/537.36";
const BASE_URL = "https://www.musixmatch.com/ws/1.1/";

let SECRET = null;

async function getSecret() {
  if (SECRET) return SECRET;

  const searchHtml = await fetch("https://www.musixmatch.com/search", {
    headers: { "User-Agent": USER_AGENT, Cookie: "mxm_bab=AB" },
  }).then((r) => r.text());

  const match = [...searchHtml.matchAll(/_app-[^"]+\.js/g)];
  if (!match.length) throw new Error("Could not find _app.js URL");
  const appUrl = "https://www.musixmatch.com/_next/static/chunks/pages/" + match.pop()[0];

  const jsCode = await fetch(appUrl, { headers: { "User-Agent": USER_AGENT } }).then((r) => r.text());
  const encMatch = jsCode.match(/from\("([^"]+)"\.split/);
  if (!encMatch) throw new Error("Secret not found");

  const encoded = encMatch[1];
  const reversed = encoded.split("").reverse().join("");
  SECRET = Buffer.from(reversed, "base64").toString("utf-8");
  return SECRET;
}

async function signUrl(url) {
  const secret = await getSecret();
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  const msg = url + y + m + d;
  const hmac = crypto.createHmac("sha256", secret).update(msg).digest();
  const signature = "&signature=" + encodeURIComponent(Buffer.from(hmac).toString("base64")) + "&signature_protocol=sha256";
  return url + signature;
}

async function getLyrics(query) {
  // if input has "-", split artist & track
  let artist = null, track = query;
  if (query.includes("-")) {
    const parts = query.split("-").map((s) => s.trim());
    artist = parts[1];
    track = parts[0];
  }

  const searchQ = artist ? `${track} ${artist}` : track;
  let url = `${BASE_URL}track.search?app_id=web-desktop-app-v1.0&format=json&q=${encodeURIComponent(
    searchQ
  )}&f_has_lyrics=true&page_size=1&page=1`;
  url = await signUrl(url);

  const searchRes = await fetch(url, { headers: { "User-Agent": USER_AGENT } }).then((r) => r.json());
  const list = searchRes?.message?.body?.track_list || [];
  if (!list.length) throw new Error("No tracks found");

  const trackId = list[0].track?.track_id;
  if (!trackId) throw new Error("No valid track id");

  let lyrUrl = `${BASE_URL}track.lyrics.get?app_id=web-desktop-app-v1.0&format=json&track_id=${trackId}`;
  lyrUrl = await signUrl(lyrUrl);

  const lyrRes = await fetch(lyrUrl, { headers: { "User-Agent": USER_AGENT } }).then((r) => r.json());
  const lyrics = lyrRes?.message?.body?.lyrics?.lyrics_body;
  if (!lyrics) throw new Error("Lyrics not found");

  return lyrics.replace(/(\*{5}.*|\n\n.*This Lyrics.*)/gs, "").trim();
}

export default {
  name: [".lyrics"],
  description: "Fetch lyrics from Musixmatch API",
  usage: "Get lyrics for any song with .lyrics <song> or .lyrics <song> - <artist>\n\nEg: .lyrics Shape Of You or .lyrics Shape Of You - Ed Sheeran",

  async execute(msg, args, sock) {
    const query = args.join(" ").trim();
    const jid = msg.key.remoteJid;
    if (!query) {
      await sock.sendMessage(
        jid,
        { text: "Usage: .lyrics <song> or .lyrics <song> - <artist>" },
        { quoted: msg }
      );
      return;
    }

    try {
      const lyrics = await getLyrics(query);
      await sock.sendMessage(jid, { text: lyrics }, { quoted: msg });
    } catch (err) {
      await sock.sendMessage(
        jid,
        { text: `Failed to fetch lyrics: ${err.message}` },
        { quoted: msg }
      );
    }
  },
};
      
