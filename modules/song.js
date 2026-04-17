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
import ytSearch from "yt-search";
import ytdl from "@distube/ytdl-core";

export default {
	name: [".song"],
	description: "Searches and sends a song from YouTube",
	usage: ".song <song name>",

	async execute(msg, _args, sock) {
		const jid = msg.key.remoteJid;
		const query = _args.join(" ").trim();

		if (!query) {
			return await sock.sendMessage(jid, {
				text: "Please enter a song name to download.",
			});
		}

		try {
			const progressMsg = await sock.sendMessage(
				jid,
				{ text: `Searching for "${query}" on YouTube...` },
				{ quoted: msg },
			);

			const searchResults = await ytSearch(query);
			const song = searchResults.videos.length > 0 ? searchResults.videos[0] : null;

			if (!song) {
				return await sock.sendMessage(
					jid,
					{ text: `No results found for "${query}".`, edit: progressMsg.key },
					{ quoted: msg },
				);
			}

			const songName = song.title;
			const songUrl = song.url;
			const thumbUrl = song.thumbnail;
			const artistName = "Artist:" + song.author.name;

			const tempDir = path.resolve("./temp");
			if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

			const timeStamp = Date.now();
			const audioPath = path.join(tempDir, `${timeStamp}.m4a`);
			const thumbPath = path.join(tempDir, `${timeStamp}.jpg`);

			await sock.sendMessage(
				jid,
				{ text: `Downloading "${songName}"...`, edit: progressMsg.key },
				{ quoted: msg },
			);

			if (thumbUrl) {
				const thumbBuffer = await fetch(thumbUrl).then((r) => r.buffer());
				fs.writeFileSync(thumbPath, thumbBuffer);
			}

			const audioStream = ytdl(songUrl, {
				filter: (format) => format.container === "mp4" && !format.hasVideo && format.hasAudio,
				quality: "highestaudio",
			});

			const writeStream = fs.createWriteStream(audioPath);

			await new Promise((resolve, reject) => {
				audioStream.pipe(writeStream);
				audioStream.on("error", reject);
				writeStream.on("error", reject);
				writeStream.on("finish", resolve);
			});

			await sock.sendMessage(
				jid,
				{ text: `Uploading "${songName}"...`, edit: progressMsg.key },
				{ quoted: msg },
			);

			await sock.sendMessage(
				jid,
				{
					audio: { url: audioPath },
					mimetype: "audio/mp4",
					fileName: `${songName}.m4a`,
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

			[audioPath, thumbPath].forEach((f) => {
				if (fs.existsSync(f)) {
					fs.unlinkSync(f);
				}
			});
		} catch (err) {
			console.error("Song command error:", err);
			await sock.sendMessage(
				jid,
				{
					text: "Failed to download or send the song. Please try again later.",
				},
				{ quoted: msg },
			);
		}
	},
};
