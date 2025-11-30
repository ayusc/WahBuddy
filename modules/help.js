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

import { getAllCommands } from "../main.js";

export default {
	name: [".help"],
	description: "Lists all commands or shows usage for a specific command",

	async execute(msg, args, sock) {
		const prefix = ".";
		const chatId = msg.key.remoteJid;
		const commands = getAllCommands();

		if (args.length > 0) {
			const query = prefix + args[0];
			const cmd = commands.find((c) => {
				const names = Array.isArray(c.name) ? c.name : [c.name];
				return names.includes(query);
			});

			if (!cmd) {
				return await sock.sendMessage(
					chatId,
					{ text: `Command not found: ${args[0]}` },
					{ quoted: msg },
				);
			}

			const usage = cmd.usage || cmd.description;
			const names = Array.isArray(cmd.name) ? cmd.name.join(", ") : cmd.name;
			const text = `Usage for ${names}:\n\n${usage}`;

			return await sock.sendMessage(chatId, { text }, { quoted: msg });
		}

		let text = "Hi there, welcome to WahBuddy\n\n";
		text += "Here are all available commands:\n\n";
		text += "A userbot for WhatsApp written in pure JavaScript\n\n";
		text += "Here are all the bot commands:\n";
		text += "To know command usage please type `.help {command}`\n\n";

		for (const cmd of commands) {
			const namesArray = Array.isArray(cmd.name) ? cmd.name : [cmd.name];
			const displayNames = namesArray.map((name) =>
				name.startsWith(".") ? name.slice(1) : name,
			);
			text += `• \`${displayNames.join(", ")}\` — ${cmd.description}\n\n`;
		}

		await sock.sendMessage(chatId, { text: text.trim() }, { quoted: msg });
	},
};
