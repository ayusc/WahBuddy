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
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import dotenv from "dotenv";
import fetch from "node-fetch";
import ffmpegPath from "ffmpeg-static";

dotenv.config();

const MERRIAM_API_KEY = process.env.MERRIAM_API_KEY;
const AUDIO_BASE_URL = "https://media.merriam-webster.com/soundc11";
const execAsync = promisify(exec);

function cleanMWText(text) {
	if (!text) return "";
	return text
		.replace(/\{(?:d_link|a_link|i_link|et_link|sx|mat|ma)\|([^|}]+)(?:\|[^}]*)?\}/g, "$1")
		.replace(/\{bc\}/g, "")
		.replace(/\{(?:it|wi|phrase|qword|gloss|parahw)\}(.*?)\{\/(?:it|wi|phrase|qword|gloss|parahw)\}/g, "_$1_")
		.replace(/\{b\}(.*?)\{\/b\}/g, "*$1*")
		.replace(/\{sc\}(.*?)\{\/sc\}/g, "$1")
		.replace(/\{[^}]+\}/g, "")
		.replace(/^[\u2026…\.\s]+|[\u2026…\.\s]+$/g, "")
		.replace(/\s+/g, " ")
		.trim();
}

function getWordQuery(msg, _args) {
	let word = _args.join(" ").trim();
	const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;

	if (!word && quoted) {
		const quotedType = Object.keys(quoted)[0];
		if (quotedType === "conversation") {
			word = quoted.conversation.trim();
		} else if (quotedType === "extendedTextMessage") {
			word = quoted.extendedTextMessage?.text?.trim() || "";
		}
	}
	return word;
}

async function convertWavToOpus(wavBuffer) {
	const tempDir = os.tmpdir();
	const inputPath = path.join(tempDir, `input_${Date.now()}.wav`);
	const outputPath = path.join(tempDir, `output_${Date.now()}.ogg`);

	try {
		await fs.promises.writeFile(inputPath, wavBuffer);
		await execAsync(
			`"${ffmpegPath}" -y -i "${inputPath}" -c:a libopus -ac 1 -ar 48000 -b:a 32k "${outputPath}"`,
		);
		const opusBuffer = await fs.promises.readFile(outputPath);
		await Promise.all([
			fs.promises.unlink(inputPath).catch(() => {}),
			fs.promises.unlink(outputPath).catch(() => {}),
		]);
		return opusBuffer;
	} catch (err) {
		console.error("Audio conversion failed:", err);
		await fs.promises.unlink(inputPath).catch(() => {});
		return null;
	}
}

export default [
	{
		name: ".def",
		description: "Get definition, examples, and synonyms",
		usage: ".def <word>",

		async execute(msg, _args, sock) {
			const jid = msg.key.remoteJid;

			if (!MERRIAM_API_KEY) {
				return await sock.sendMessage(
					jid,
					{ text: "Please set your Merriam-Webster API Key!" },
					{ quoted: msg },
				);
			}

			const word = getWordQuery(msg, _args);
			if (!word) {
				return await sock.sendMessage(
					jid,
					{ text: "Please provide a word to define." },
					{ quoted: msg },
				);
			}

			try {
				const res = await fetch(
					`https://www.dictionaryapi.com/api/v3/references/collegiate/json/${encodeURIComponent(word)}?key=${MERRIAM_API_KEY}`,
				);
				const data = await res.json();

				if (!data || data.length === 0) {
					return await sock.sendMessage(
						jid,
						{ text: `No results found for "${word}".` },
						{ quoted: msg },
					);
				}

				if (typeof data[0] === "string") {
					return await sock.sendMessage(
						jid,
						{
							text: `No exact definition found for "${word}".\n\nDid you mean:\n- ${data.slice(0, 8).join("\n- ")}`,
						},
						{ quoted: msg },
					);
				}

				const entry = data[0];
				const headword = entry.meta?.id?.replace(/:\d+$/, "") || word;

				let text = `*Definition of ${headword}:*\n\n`;

				const definitions = [];
				[...data].reverse().forEach((e) => {
					if (typeof e === "object" && Array.isArray(e.shortdef)) {
						e.shortdef.forEach((def) => {
							const cleaned = cleanMWText(def);
							if (cleaned && !definitions.includes(cleaned)) {
								definitions.push(cleaned);
							}
						});
					}
				});

				if (definitions.length > 0) {
					definitions.forEach((def, i) => {
						text += `${i + 1}. ${def}\n`;
					});
				} else {
					text += "No definitions found.\n";
				}

				const examples = [];
				data.forEach((e) => {
					if (typeof e === "object" && e.def) {
						for (const d of e.def) {
							if (!d.sseq) continue;
							for (const s of d.sseq) {
								for (const item of s) {
									if (!item[1]?.dt) continue;
									for (const dt of item[1].dt) {
										if (dt[0] === "vis" && Array.isArray(dt[1])) {
											dt[1].forEach((v) => {
												if (v.t) {
													const cleaned = cleanMWText(v.t);
													if (cleaned && !examples.includes(cleaned)) {
														examples.push(cleaned);
													}
												}
											});
										}
									}
								}
							}
						}
					}
				});

				if (examples.length > 0) {
					text += `\n*Examples:*\n`;
					examples.slice(0, 5).forEach((ex) => {
						text += `- ${ex}\n`;
					});
				}

				const synonyms = [];
				const jsonStr = JSON.stringify(data);

				data.forEach((e) => {
					if (typeof e === "object" && e.meta?.syns) {
						e.meta.syns.forEach((synGroup) => {
							if (Array.isArray(synGroup)) {
								synGroup.forEach((syn) => {
									const synWord = typeof syn === "string" ? syn : syn.wd;
									if (synWord) synonyms.push(cleanMWText(synWord));
								});
							}
						});
					}
				});

				const sxRegex = /\{sx\|([^|]+)(?:\|[^}]*)?\}/g;
				let match;
				match = sxRegex.exec(jsonStr);
				while (match !== null) {
					if (match[1]) synonyms.push(cleanMWText(match[1]));
					match = sxRegex.exec(jsonStr);
				}

				if (synonyms.length === 0) {
					const dlinkRegex = /\{d_link\|([^|]+)(?:\|[^}]*)?\}/g;
					match = dlinkRegex.exec(jsonStr);
					while (match !== null) {
						if (match[1]) synonyms.push(cleanMWText(match[1]).replace(/:\d+$/, ""));
						match = dlinkRegex.exec(jsonStr);
					}
				}

				const uniqueSynonyms = [...new Set(synonyms)].filter(
					(s) => s.toLowerCase() !== headword.toLowerCase() && s.length > 0,
				);

				if (uniqueSynonyms.length > 0) {
					text += `\n*Synonyms/Related Words:*\n- ${uniqueSynonyms.slice(0, 8).join("\n- ")}`;
				}

				await sock.sendMessage(jid, { text: text.trim() }, { quoted: msg });
			} catch (err) {
				console.error("Def command error:", err);
				await sock.sendMessage(
					jid,
					{ text: `Failed to fetch definition: ${err.message}` },
					{ quoted: msg },
				);
			}
		},
	},
	{
		name: ".pronounce",
		description: "Send audio pronunciation clip as voice note",
		usage: ".pronounce <word>",

		async execute(msg, _args, sock) {
			const jid = msg.key.remoteJid;

			if (!MERRIAM_API_KEY) {
				return await sock.sendMessage(
					jid,
					{ text: "Please set your Merriam-Webster API Key!" },
					{ quoted: msg },
				);
			}

			const word = getWordQuery(msg, _args);
			if (!word) {
				return await sock.sendMessage(
					jid,
					{ text: "Please provide a word to pronounce." },
					{ quoted: msg },
				);
			}

			try {
				const res = await fetch(
					`https://www.dictionaryapi.com/api/v3/references/collegiate/json/${encodeURIComponent(word)}?key=${MERRIAM_API_KEY}`,
				);
				const data = await res.json();

				if (!data || data.length === 0 || typeof data[0] === "string") {
					return await sock.sendMessage(
						jid,
						{ text: `No pronunciation audio found for "${word}".` },
						{ quoted: msg },
					);
				}

				let audioFile = null;
				for (const entry of data) {
					if (entry.hwi?.prs) {
						for (const pr of entry.hwi.prs) {
							if (pr.sound?.audio) {
								audioFile = pr.sound.audio;
								break;
							}
						}
					}
					if (audioFile) break;
				}

				if (!audioFile) {
					return await sock.sendMessage(
						jid,
						{ text: `No pronunciation audio available for "${word}".` },
						{ quoted: msg },
					);
				}

				let subdir = audioFile[0];
				if (audioFile.startsWith("bix")) subdir = "bix";
				else if (audioFile.startsWith("gg")) subdir = "gg";
				else if (/^[^a-zA-Z]/.test(audioFile)) subdir = "number";

				const audioUrl = `${AUDIO_BASE_URL}/${subdir}/${audioFile}.wav`;

				const audioRes = await fetch(audioUrl);
				if (!audioRes.ok) throw new Error(`HTTP ${audioRes.status}`);

				const wavBuffer = Buffer.from(await audioRes.arrayBuffer());
				const audioBuffer = await convertWavToOpus(wavBuffer);
				
				if (!audioBuffer) {
					return await sock.sendMessage(
						jid,
						{ text: "Failed to convert pronunciation audio into a voice note." },
						{ quoted: msg },
					);
				}
				
				await sock.sendMessage(
					jid,
					{
						audio: audioBuffer,
						mimetype: "audio/ogg; codecs=opus",
						ptt: true,
					},
					{ quoted: msg },
				);
			} catch (err) {
				console.error("Pronounce command error:", err);
				await sock.sendMessage(
					jid,
					{ text: `Failed to get pronunciation: ${err.message}` },
					{ quoted: msg },
				);
			}
		},
	},
];
