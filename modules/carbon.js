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

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export default {
	name: [".carbon"],
	description: "Generate a code snippet image using carbon.now.sh",
	usage:
		"Type .carbon in reply to a code block to Generate a code snippet image using carbon.now.sh",

	async execute(msg, _args, sock) {
		const jid = msg.key.remoteJid;
		const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;

		let code = "";

		if (quoted) {
			const quotedType = Object.keys(quoted)[0];
			if (quotedType === "conversation") {
				code = quoted.conversation.trim();
			} else if (quotedType === "extendedTextMessage") {
				code = quoted.extendedTextMessage?.text?.trim() || "";
			}
		} else {
			const type = Object.keys(msg.message || {})[0];
			if (type === "conversation") {
				code = msg.message.conversation.replace(/^\.carbon\s*/, "").trim();
			} else if (type === "extendedTextMessage") {
				code =
					msg.message.extendedTextMessage?.text
						?.replace(/^\.carbon\s*/, "")
						.trim() || "";
			}
		}

		if (!code) {
			return await sock.sendMessage(
				jid,
				{ text: "Please provide some code to render." },
				{ quoted: msg },
			);
		}

		code = code
			.split("\n")
			.map((line) => line.trimStart())
			.join("\n");

		const tempDir = path.resolve("./temp");
		if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

		const timeStamp = Date.now();
		const codeFilePath = path.join(tempDir, `${timeStamp}.txt`);
		const imagePath = path.join(tempDir, `${timeStamp}.png`);

		try {
			fs.writeFileSync(codeFilePath, code);

			execSync(
				`npx carbon-now "${codeFilePath}" --settings '{"theme": "one-light", "backgroundColor": "#FF0000", "dropShadow": true, "fontFamily": "Monoid", "prettify": true}' --target-dir "${tempDir}" --target-file "${timeStamp}" -s`,
			);

			if (!fs.existsSync(imagePath)) {
				throw new Error("Carbon image file was not created.");
			}

			const buffer = fs.readFileSync(imagePath);

			await sock.sendMessage(jid, { image: buffer }, { quoted: msg });
		} catch (err) {
			console.error("Carbon command error:", err);
			return await sock.sendMessage(
				jid,
				{ text: "Failed to generate image from code." },
				{ quoted: msg },
			);
		} finally {
			[codeFilePath, imagePath].forEach((file) => {
				if (fs.existsSync(file)) {
					fs.unlinkSync(file);
				}
			});
		}
	},
};
