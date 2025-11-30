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

import axios from "axios";

export default {
	name: [".trs"],
	description: "Fetch torrents from PirateBay and return top results",
	usage:
		"Type .trs <search-term> to search for a torrent and use .trs <number> <search-term> to get the magnet link for that torrent",

	async execute(msg, args, sock) {
		const sender = msg.key.remoteJid;

		if (!args.length) {
			await sock.sendMessage(
				sender,
				{ text: "No arguments given for search" },
				{ quoted: msg },
			);
			return;
		}

		let index = null;
		let queryArgs = args;

		// If first argument is a number, treat it as index
		if (!Number.isNaN(args[0])) {
			index = parseInt(args[0], 10) - 1; // convert to 0-based index
			queryArgs = args.slice(1);
		}

		const query = queryArgs.join(" ");
		const baseUrl =
			"https://news-api-six-navy.vercel.app/api/torrent/piratebay";

		try {
			const res = await axios.get(`${baseUrl}/${encodeURIComponent(query)}/1`);
			const torrents = res.data;

			if (!torrents.length) {
				await sock.sendMessage(
					sender,
					{ text: `No results found for *${query}*.` },
					{ quoted: msg },
				);
				return;
			}

			if (index !== null) {
				if (index < 0 || index >= torrents.length) {
					await sock.sendMessage(
						sender,
						{ text: `Invalid index. Only ${torrents.length} result(s) found.` },
						{ quoted: msg },
					);
					return;
				}

				const selected = torrents[index];
				await sock.sendMessage(
					sender,
					{
						text: `${selected.Magnet || "N/A"}`,
					},
					{ quoted: msg },
				);
				return;
			}

			let reply = `*Search results for "${query}"*:\n\n`;

			torrents.forEach((torrent, i) => {
				reply +=
					`${i + 1}.  ` +
					`*Name:* ${torrent.Name || "N/A"}\n` +
					`*Size:* ${torrent.Size || "N/A"}\n` +
					`*Category:* ${torrent.Category || "N/A"}\n` +
					`*Upload Date:* ${torrent.DateUploaded || "N/A"}\n` +
					`*Seeders:* ${torrent.Seeders || "N/A"}\n` +
					`*Leechers:* ${torrent.Leechers || "N/A"}\n\n`;
			});

			await sock.sendMessage(sender, { text: reply.trim() }, { quoted: msg });
		} catch (err) {
			console.error("Error fetching:", err.message);
			await sock.sendMessage(
				sender,
				{ text: "An error occurred while fetching torrent data." },
				{ quoted: msg },
			);
		}
	},
};
