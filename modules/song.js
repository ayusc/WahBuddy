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

import fs from "node:fs";
import path from "node:path";
import fetch from "node-fetch";
import { Innertube } from "youtubei.js";

let yt = null;
async function getYT() {
	if (!yt) {
		yt = await Innertube.create();
	}
	return yt;
}

export default {
	name: [".song"],
	description: "Searches and sends a song from YouTube using YouTube.js",
	usage: ".song <song name>",

	async execute(msg, _args, sock) {
		const jid = msg.key.remoteJid;
		const query = _args.join(" ").trim();

		if (!query) {
			return await sock.sendMessage(jid, {
				text: "Please enter a song name to download.",
			});
		}

		let audioPath = "";
		let thumbPath = "";

		try {
			const progressMsg = await sock.sendMessage(
				jid,
				{ text: `Searching for "${query}" on YouTube...` },
				{ quoted: msg },
			);

			const youtube = await getYT();
			const search = await youtube.search(query, { type: "video" });
			const video = search.videos?.[0];

			if (!video) {
				return await sock.sendMessage(
					jid,
					{ text: `No results found for "${query}".`, edit: progressMsg.key },
					{ quoted: msg },
				);
			}

			const songName = video.title?.text || video.title || "Unknown Song";
			const songUrl = `https://www.youtube.com/watch?v=${video.id}`;
			const thumbUrl = video.thumbnails?.[0]?.url || "";
			const artistName = `Artist: ${video.author?.name || "Unknown"}`;

			const tempDir = path.resolve("./temp");
			if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

			const timeStamp = Date.now();
			audioPath = path.join(tempDir, `${timeStamp}.mp3`);
			thumbPath = path.join(tempDir, `${timeStamp}.jpg`);

			await sock.sendMessage(
				jid,
				{ text: `Downloading "${songName}"...`, edit: progressMsg.key },
				{ quoted: msg },
			);

			if (thumbUrl) {
				const thumbRes = await fetch(thumbUrl);
				if (thumbRes.ok) {
					const thumbBuffer = Buffer.from(await thumbRes.arrayBuffer());
					fs.writeFileSync(thumbPath, thumbBuffer);
				}
			}

			// Extract audio via Cobalt API to avoid Koyeb datacenter IP bans
			const cobaltRes = await fetch("https://api.cobalt.tools/", {
				method: "POST",
				headers: {
					Accept: "application/json",
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					url: songUrl,
					downloadMode: "audio",
					audioFormat: "mp3",
				}),
			});

			if (!cobaltRes.ok) {
				throw new Error(`Cobalt API error: HTTP ${cobaltRes.status}`);
			}

			const cobaltData = await cobaltRes.json();
			if (!cobaltData.url) {
				throw new Error("Could not retrieve audio download link.");
			}

			const audioRes = await fetch(cobaltData.url);
			if (!audioRes.ok) {
				throw new Error(`Audio download failed: HTTP ${audioRes.status}`);
			}

			const audioBuffer = Buffer.from(await audioRes.arrayBuffer());
			fs.writeFileSync(audioPath, audioBuffer);

			await sock.sendMessage(
				jid,
				{ text: `Uploading "${songName}"...`, edit: progressMsg.key },
				{ quoted: msg },
			);

			await sock.sendMessage(
				jid,
				{
					audio: { url: audioPath },
					mimetype: "audio/mpeg",
					fileName: `${songName}.mp3`,
					ptt: false,
					contextInfo: {
						externalAdReply: {
							title: songName,
							body: artistName,
							thumbnailUrl: thumbUrl,
							mediaType: 1,
							renderLargerThumbnail: true,
						},
					},
				},
				{ quoted: msg },
			);
		} catch (err) {
			console.error("Song command error:", err);
			await sock.sendMessage(
				jid,
				{
					text: "Failed to download or send the song. Please try again later.",
				},
				{ quoted: msg },
			);
		} finally {
			[audioPath, thumbPath].forEach((f) => {
				if (f && fs.existsSync(f)) {
					fs.unlinkSync(f);
				}
			});
		}
	},
};
