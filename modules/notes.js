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

import { downloadMediaMessage } from "baileys";
import { db } from "../main.js";

let notesCollection;
function setupNotesCollection() {
	if (!notesCollection) {
		notesCollection = db.collection("notes");
	}
}

export default [
	{
		name: ".save",
		description: "Save a note (text/media) by name in the chat.",
		usage: ".save <name> [text or reply to message]",
		async execute(msg, args, sock) {
			setupNotesCollection();
			const jid = msg.key.remoteJid;

			if (!args[0]) {
				await sock.sendMessage(
					jid,
					{
						text: "Please provide a note name.\n\nExample: `.save hi hello`",
					},
					{ quoted: msg },
				);
				return;
			}

			const name = args[0].toLowerCase();
			const existing = await notesCollection.findOne({ name, jid });

			if (existing) {
				await sock.sendMessage(
					jid,
					{ text: `Note "${name}" already exists in this chat.` },
					{ quoted: msg },
				);
				return;
			}

			const quoted =
				msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
			let content = null;
			let media = null;

			if (quoted) {
				const text =
					quoted?.conversation ||
					quoted?.extendedTextMessage?.text ||
					quoted?.imageMessage?.caption ||
					quoted?.videoMessage?.caption;
				if (text) content = text.trim();

				const type = Object.keys(quoted)[0];
				const hasMedia = [
					"imageMessage",
					"videoMessage",
					"audioMessage",
					"stickerMessage",
					"documentMessage",
				].includes(type);
				if (hasMedia) {
					const buffer = await downloadMediaMessage(
						{ message: quoted },
						"buffer",
						{},
						{ logger: console, reuploadRequest: sock.updateMediaMessage },
					);

					media = {
						type,
						mimetype: quoted[type].mimetype || null,
						data: buffer,
					};
				}

				if (!content && !media) {
					await sock.sendMessage(
						jid,
						{ text: "Cannot save empty or unsupported message." },
						{ quoted: msg },
					);
					return;
				}
			} else if (args.length > 1) {
				content = args.slice(1).join(" ").trim();
			} else {
				await sock.sendMessage(
					jid,
					{
						text: "Please reply to a message or provide text.\n\nExample: `.save hi hello`",
					},
					{ quoted: msg },
				);
				return;
			}

			await notesCollection.insertOne({
				name,
				jid,
				content,
				media,
				createdAt: new Date(),
			});

			await sock.sendMessage(
				jid,
				{ text: `Note "${name}" saved.` },
				{ quoted: msg },
			);
		},
	},

	{
		name: ".note",
		description: "Send a saved note in the chat.",
		usage: ".note <name>",
		async execute(msg, args, sock) {
			setupNotesCollection();
			const jid = msg.key.remoteJid;

			if (!args[0]) {
				await sock.sendMessage(
					jid,
					{
						text: "Usage: `.note <name>`\n\nExample: `.note hi`",
					},
					{ quoted: msg },
				);
				return;
			}

			const name = args[0].toLowerCase();
			const note = await notesCollection.findOne({ name, jid });

			if (!note) {
				await sock.sendMessage(
					jid,
					{ text: `Note "${name}" not found in this chat.` },
					{ quoted: msg },
				);
				return;
			}

			if (note.media) {
				const options = { quoted: msg };
				const data = note.media.data.buffer; // BSON binary

				switch (note.media.type) {
					case "imageMessage":
						await sock.sendMessage(jid, {
							image: data,
							caption: note.content || "",
							...options,
						});
						break;
					case "videoMessage":
						await sock.sendMessage(jid, {
							video: data,
							caption: note.content || "",
							gifPlayback: note.media.mimetype === "image/gif",
							...options,
						});
						break;
					case "audioMessage":
						await sock.sendMessage(jid, {
							audio: data,
							mimetype: "audio/mpeg",
							...options,
						});
						break;
					case "stickerMessage":
						await sock.sendMessage(jid, { sticker: data, ...options });
						break;
					case "documentMessage":
						await sock.sendMessage(jid, {
							document: data,
							fileName: `${name}.bin`,
							mimetype: note.media.mimetype || "application/octet-stream",
							...options,
						});
						break;
					default:
						await sock.sendMessage(
							jid,
							{ text: "Unknown media type." },
							{ quoted: msg },
						);
				}
			} else {
				await sock.sendMessage(jid, { text: note.content }, { quoted: msg });
			}
		},
	},

	{
		name: ".notes",
		description: "List all saved notes in the chat.",
		usage: ".notes",
		async execute(msg, _args, sock) {
			setupNotesCollection();
			const jid = msg.key.remoteJid;

			const notes = await notesCollection.find({ jid }).toArray();

			if (!notes.length) {
				await sock.sendMessage(
					jid,
					{ text: "No saved notes in this chat." },
					{ quoted: msg },
				);
				return;
			}

			const list = notes.map((n) => `• ${n.name}`).join("\n");
			await sock.sendMessage(
				jid,
				{ text: `*Saved Notes:*\n\n${list}` },
				{ quoted: msg },
			);
		},
	},

	{
		name: ".clear",
		description: "Delete a specific note by name in the chat.",
		usage: ".clear <name>",
		async execute(msg, args, sock) {
			setupNotesCollection();
			const jid = msg.key.remoteJid;

			if (!args[0]) {
				await sock.sendMessage(
					jid,
					{
						text: "Usage: `.clear <name>`\n\nExample: `.clear hi`",
					},
					{ quoted: msg },
				);
				return;
			}

			const name = args[0].toLowerCase();
			const result = await notesCollection.deleteOne({ name, jid });

			if (result.deletedCount > 0) {
				await sock.sendMessage(
					jid,
					{ text: `Note "${name}" deleted.` },
					{ quoted: msg },
				);
			} else {
				await sock.sendMessage(
					jid,
					{ text: `No note named "${name}" in this chat.` },
					{ quoted: msg },
				);
			}
		},
	},

	{
		name: ".clearnotes",
		description: "Delete all saved notes in the chat.",
		usage: ".clearnotes",
		async execute(msg, _args, sock) {
			setupNotesCollection();
			const jid = msg.key.remoteJid;

			const result = await notesCollection.deleteMany({ jid });

			if (result.deletedCount > 0) {
				await sock.sendMessage(
					jid,
					{ text: `Cleared ${result.deletedCount} notes from this chat.` },
					{ quoted: msg },
				);
			} else {
				await sock.sendMessage(
					jid,
					{ text: "There are no notes to clear in this chat." },
					{ quoted: msg },
				);
			}
		},
	},

	{
		name: ".rename",
		description: "Rename a note in the chat.",
		usage: ".rename <old_name> <new_name>",
		async execute(msg, args, sock) {
			setupNotesCollection();
			const jid = msg.key.remoteJid;

			if (args.length < 2) {
				await sock.sendMessage(
					jid,
					{
						text: "Usage: `.rename <old_name> <new_name>`\n\nExample: `.rename hi hello`",
					},
					{ quoted: msg },
				);
				return;
			}

			const [oldName, newName] = [args[0].toLowerCase(), args[1].toLowerCase()];
			const note = await notesCollection.findOne({ name: oldName, jid });

			if (!note) {
				await sock.sendMessage(
					jid,
					{ text: `Note "${oldName}" not found.` },
					{ quoted: msg },
				);
				return;
			}

			const exists = await notesCollection.findOne({ name: newName, jid });
			if (exists) {
				await sock.sendMessage(
					jid,
					{ text: `Note "${newName}" already exists.` },
					{ quoted: msg },
				);
				return;
			}

			await notesCollection.updateOne(
				{ name: oldName, jid },
				{ $set: { name: newName } },
			);
			await sock.sendMessage(
				jid,
				{ text: `Renamed note "${oldName}" to "${newName}".` },
				{ quoted: msg },
			);
		},
	},

	{
		name: ".exportnotes",
		description: "Export all notes from the chat into a export file.",
		usage: ".exportnotes",
		async execute(msg, _args, sock) {
			setupNotesCollection();
			const jid = msg.key.remoteJid;

			const notes = await notesCollection.find({ jid }).toArray();
			if (!notes.length) {
				await sock.sendMessage(
					jid,
					{ text: "No notes to export in this chat." },
					{ quoted: msg },
				);
				return;
			}

			const exportData = notes.map((n) => ({
				name: n.name,
				content: n.content || null,
				media: n.media
					? {
							type: n.media.type,
							mimetype: n.media.mimetype || null,
							data: bufferToBase64(n.media.data.buffer),
						}
					: null,
			}));

			const jsonBuffer = Buffer.from(JSON.stringify(exportData, null, 2));
			await sock.sendMessage(
				jid,
				{
					document: jsonBuffer,
					fileName: "notes_export.json",
					mimetype: "application/json",
				},
				{ quoted: msg },
			);
		},
	},

	{
		name: ".importnotes",
		description: "Import notes in the chat by replying to a export file.",
		usage: ".importnotes (reply to file)",
		async execute(msg, _args, sock) {
			setupNotesCollection();
			const jid = msg.key.remoteJid;

			const quoted =
				msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
			const doc = quoted?.documentMessage;
			if (!doc) {
				await sock.sendMessage(
					jid,
					{ text: "Please reply to a valid exported notes file (.json)." },
					{ quoted: msg },
				);
				return;
			}

			const buffer = await downloadMediaMessage(
				{ message: quoted },
				"buffer",
				{},
				{ logger: console, reuploadRequest: sock.updateMediaMessage },
			);

			let data;
			try {
				data = JSON.parse(buffer.toString());
			} catch {
				await sock.sendMessage(
					jid,
					{ text: "Invalid JSON format." },
					{ quoted: msg },
				);
				return;
			}

			if (!Array.isArray(data)) {
				await sock.sendMessage(
					jid,
					{ text: "Invalid format: expected an array of notes." },
					{ quoted: msg },
				);
				return;
			}

			let imported = 0;
			for (const n of data) {
				if (!n.name) continue;

				const doc = {
					name: n.name.toLowerCase(),
					jid,
					content: n.content || null,
					media: n.media
						? {
								type: n.media.type,
								mimetype: n.media.mimetype || null,
								data: base64ToBuffer(n.media.data),
							}
						: null,
					createdAt: new Date(),
				};

				await notesCollection.updateOne(
					{ name: doc.name, jid },
					{ $set: doc },
					{ upsert: true },
				);
				imported++;
			}

			await sock.sendMessage(
				jid,
				{ text: `Imported ${imported} notes into this chat.` },
				{ quoted: msg },
			);
		},
	},
];
