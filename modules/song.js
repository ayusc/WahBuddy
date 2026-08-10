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
import ytDlp from "yt-dlp-exec";

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

		let audioPath = "";
		let thumbPath = "";

		try {
			const progressMsg = await sock.sendMessage(
				jid,
				{ text: `Searching for "${query}" on YouTube...` },
				{ quoted: msg },
			);

			const metadata = await ytDlp(`ytsearch1:${query}`, {
				dumpSingleJson: true,
				noWarnings: true,
				noCheckCertificates: true,
				preferFreeFormats: true,
				geoBypass: true,
				addHeader: ["referer:youtube.com", "user-agent:googlebot"],
				extractorArgs: "youtube:player_client=ios,android",
			});

			const video = metadata.entries?.[0] || metadata;

			if (!video || !video.webpage_url) {
				return await sock.sendMessage(
					jid,
					{ text: `No results found for "${query}".`, edit: progressMsg.key },
					{ quoted: msg },
				);
			}

			const songName = video.title || video.fulltitle || "Unknown Song";
			const songUrl = video.webpage_url;
			const thumbUrl = video.thumbnail || "";
			const artistName = `Artist: ${video.uploader || video.channel || "Unknown"}`;

			const tempDir = path.resolve("./temp");
			if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

			const timeStamp = Date.now();
			audioPath = path.join(tempDir, `${timeStamp}.m4a`);
			thumbPath = path.join(tempDir, `${timeStamp}.jpg`);

			await sock.sendMessage(
				jid,
				{ text: `Downloading "${songName}"...`, edit: progressMsg.key },
				{ quoted: msg },
			);

			if (thumbUrl) {
				try {
					const thumbRes = await fetch(thumbUrl);
					if (thumbRes.ok) {
						const thumbBuffer = Buffer.from(await thumbRes.arrayBuffer());
						fs.writeFileSync(thumbPath, thumbBuffer);
					}
				} catch (e) {
					console.warn("Failed to fetch thumbnail preview:", e.message);
				}
			}

			await ytDlp(songUrl, {
				format: "bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio",
				output: audioPath,
				addHeader: ["referer:youtube.com", "user-agent:googlebot"],
				noCheckCertificates: true,
				noWarnings: true,
				preferFreeFormats: true,
				geoBypass: true,
				extractorArgs: "youtube:player_client=ios,android",
			});

			if (!fs.existsSync(audioPath)) {
				throw new Error("Audio file was not generated.");
			}

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
		} catch (err) {
			console.error("Song command error:", err.stderr || err.message || err);
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
