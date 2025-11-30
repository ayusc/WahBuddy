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

import { exec } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mime from "mime-types";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_FILE = path.join(__dirname, "term_output.txt");

export default {
	name: [".term"],
	description: "Executes terminal commands with root shell access",

	async execute(msg, _args, sock) {
		const sender = msg.key.remoteJid;
		let command = "";

		const body =
			msg.message?.conversation || msg.message?.extendedTextMessage?.text || "";

		if (body.startsWith(".term\n")) {
			command = body.split("\n").slice(1).join("\n").trim();
		} else if (body.startsWith(".term")) {
			command = body.replace(/^\.term\s*/, "").trim();
		}

		if (
			!command &&
			msg.message?.extendedTextMessage?.contextInfo?.quotedMessage
		) {
			const quoted = msg.message.extendedTextMessage.contextInfo.quotedMessage;
			const quotedBody =
				quoted.conversation || quoted.extendedTextMessage?.text || "";
			command = quotedBody.trim();
		}

		if (!command) {
			await sock.sendMessage(
				sender,
				{ text: "No terminal command provided." },
				{ quoted: msg },
			);
			return;
		}

		exec(command, { shell: "/bin/bash" }, async (error, stdout, stderr) => {
			let output = "";

			if (stdout) output += `stdout:\n${stdout}`;
			if (stderr) output += `\nstderr:\n${stderr}`;
			if (error) output += `\nError:\n${error.message}`;
			if (!output.trim()) output = "Command executed successfully (no output)";

			if (output.length > 2000) {
				fs.writeFileSync(OUTPUT_FILE, output);
				const fileBuffer = fs.readFileSync(OUTPUT_FILE);
				const mimetype = mime.lookup(OUTPUT_FILE) || "text/plain";

				await sock.sendMessage(
					sender,
					{
						document: fileBuffer,
						fileName: "output.txt",
						mimetype: mimetype,
						caption: "Output too long. Sent as file.",
					},
					{ quoted: msg },
				);

				fs.unlinkSync(OUTPUT_FILE);
			} else {
				await sock.sendMessage(
					sender,
					{ text: `\`\`\`${output.trim()}\`\`\`` },
					{ quoted: msg },
				);
			}
		});
	},
};
