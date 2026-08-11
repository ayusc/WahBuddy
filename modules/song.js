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

export default {
	name: [".song"],
	description: "Searches and sends a song",
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
				{ text: `Searching for "${query}" on Saavn...` },
				{ quoted: msg },
			);

			const searchRes = await fetch(
				`https://rsjiprivate-api.vercel.app/api/search/songs?query=${encodeURIComponent(query)}`,
			);

			if (!searchRes.ok) {
				throw new Error(`API error: HTTP ${searchRes.status}`);
			}

			const result = await searchRes.json();

			if (!result.success || !result.data?.results?.[0]) {
				return await sock.sendMessage(
					jid,
					{ text: `No results found for "${query}".`, edit: progressMsg.key },
					{ quoted: msg },
				);
			}

			const songDetails = result.data.results[0];
			const songName = songDetails.name || "Unknown Song";
			const downloadUrlList = songDetails.downloadUrl;
			const downloadUrl =
				downloadUrlList?.[downloadUrlList.length - 1]?.url ||
				downloadUrlList?.[0]?.url;

			if (!downloadUrl) {
				throw new Error("Download URL not found in API response.");
			}

			const thumbUrl =
				songDetails.image?.[2]?.url ||
				songDetails.image?.[1]?.url ||
				songDetails.image?.[0]?.url ||
				"";
			const artistName = `Artist: ${
				songDetails.primaryArtists || songDetails.artist || "Unknown"
			}`;

			const tempDir = path.resolve("./temp");
			if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

			const timeStamp = Date.now();
			audioPath = path.join(tempDir, `${timeStamp}.mp3`);
			thumbPath = path.join(tempDir, `${timeStamp}.jpg`);

			await sock.sendMessage(
				jid,
				{ text: `Downloading "${songName}"...`, edit: progressMsg.key },
				{ quoted: msg },
			);

			let thumbBuffer = null;
			if (thumbUrl) {
				try {
					const thumbRes = await fetch(thumbUrl);
					if (thumbRes.ok) {
						thumbBuffer = Buffer.from(await thumbRes.arrayBuffer());
						fs.writeFileSync(thumbPath, thumbBuffer);
					}
				} catch (e) {
					console.warn("Failed to fetch thumbnail preview:", e.message);
				}
			}

			const audioRes = await fetch(downloadUrl);
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

			const contextInfo = {
				externalAdReply: {
					title: songName,
					body: artistName,
					mediaType: 1,
					renderLargerThumbnail: true,
				},
			};

			if (thumbBuffer) {
				contextInfo.externalAdReply.thumbnail = thumbBuffer;
			} else if (thumbUrl) {
				contextInfo.externalAdReply.thumbnailUrl = thumbUrl;
			}

			await sock.sendMessage(
				jid,
				{
					audio: { url: audioPath },
					mimetype: "audio/mpeg",
					fileName: `${songName}.mp3`,
					ptt: false,
					contextInfo,
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
			[audioPath, thumbPath].forEach((filePath) => {
				if (filePath && fs.existsSync(filePath)) {
					fs.unlinkSync(filePath);
				}
			});
		}
	},
};
