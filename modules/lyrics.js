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

function formatDuration(seconds) {
	const sec = parseInt(seconds || 0, 10);
	const mins = Math.floor(sec / 60);
	const remainingSecs = sec % 60;
	return `${mins}:${remainingSecs.toString().padStart(2, "0")}`;
}

function formatMessage(song) {
	const title = song.trackName || song.name || "Unknown";
	const artist = song.artistName || "Unknown";
	const album = song.albumName || "Unknown";
	const duration = formatDuration(song.duration);
	const instrumental = song.instrumental ? "Yes" : "No";

	const info = [
		"> *Song Info:*",
		`> *Title:* ${title}`,
		`> *Artist:* ${artist}`,
		`> *Album:* ${album}`,
		`> *Duration:* ${duration}`,
		`> *Instrumental:* ${instrumental}`,
	].join("\n");

	const plainLyrics = song.plainLyrics || "No lyrics available.";
	const lyrics = "> *Lyrics:*\n> " + plainLyrics.replace(/\n/g, "\n> ");

	return `${info}\n\n${lyrics}`;
}

function getQuery(msg, args) {
	let query = args.join(" ").trim();
	const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;

	if (!query && quoted) {
		const quotedType = Object.keys(quoted)[0];
		if (quotedType === "conversation") {
			query = quoted.conversation.trim();
		} else if (quotedType === "extendedTextMessage") {
			query = quoted.extendedTextMessage?.text?.trim() || "";
		}
	}
	return query;
}

export default [
	{
		name: ".lyrics",
		description: "Get song info and lyrics",
		usage: ".lyrics <song name>",

		async execute(msg, args, sock) {
			const jid = msg.key.remoteJid;
			const query = getQuery(msg, args);

			if (!query) {
				return await sock.sendMessage(
					jid,
					{ text: "Usage: .lyrics <song name>" },
					{ quoted: msg },
				);
			}

			const statusMsg = await sock.sendMessage(
				jid,
				{ text: `Searching lyrics for: ${query}` },
				{ quoted: msg },
			);

			try {
				const res = await fetch(
					`https://api.deline.web.id/tools/lyrics?title=${encodeURIComponent(query)}`,
				);

				if (!res.ok) {
					return await sock.sendMessage(
						jid,
						{ text: "API error occurred.", edit: statusMsg.key },
					);
				}

				const data = await res.json();

				if (!data || !data.status || !data.result || data.result.length === 0) {
					return await sock.sendMessage(
						jid,
						{ text: "No lyrics found.", edit: statusMsg.key },
					);
				}

				const fullMessage = formatMessage(data.result[0]);

				await sock.sendMessage(jid, {
					text: fullMessage,
					edit: statusMsg.key,
				});
			} catch (err) {
				console.error("Lyrics command error:", err);
				await sock.sendMessage(
					jid,
					{ text: `Failed to fetch lyrics: ${err.message}`, edit: statusMsg.key },
				);
			}
		},
	},
];
