import dotenv from "dotenv";
import fetch from "node-fetch";

dotenv.config();

const MERRIAM_API_KEY = process.env.MERRIAM_API_KEY;

if (!MERRIAM_API_KEY) {
	throw new Error("MERRIAM_API_KEY is not set");
}

const AUDIO_BASE_URL = "https://media.merriam-webster.com/soundc11";

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

export default [
	{
		name: ".def",
		description: "Get definition, examples, and matching words",
		usage: ".def <word>",

		async execute(msg, _args, sock) {
			const jid = msg.key.remoteJid;
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
							text: `No exact definition found for "${word}".\n\nMatching words:\n- ${data.slice(0, 8).join("\n- ")}`,
						},
						{ quoted: msg },
					);
				}

				const entry = data[0];
				const headword = entry.meta?.id?.replace(/:\d+$/, "") || word;

				let text = `*Definition of ${headword}:*\n\n`;

				if (entry.shortdef && entry.shortdef.length > 0) {
					entry.shortdef.forEach((def, i) => {
						text += `${i + 1}. ${def}\n`;
					});
				} else {
					text += "No definitions found.\n";
				}

				const examples = [];
				if (entry.def) {
					for (const d of entry.def) {
						if (!d.sseq) continue;
						for (const s of d.sseq) {
							for (const item of s) {
								if (!item[1]?.dt) continue;
								for (const dt of item[1].dt) {
									if (dt[0] === "vis" && Array.isArray(dt[1])) {
										dt[1].forEach((v) => v.t && examples.push(v.t));
									}
								}
							}
						}
					}
				}

				if (examples.length > 0) {
					text += `\n*Examples:*\n`;
					examples.slice(0, 5).forEach((ex) => {
						text += `- ${ex}\n`;
					});
				}

				const matchingWords = data
					.filter((e) => typeof e === "object" && e.meta?.id)
					.map((e) => e.meta.id.replace(/:\d+$/, ""))
					.filter(
						(w, i, self) =>
							self.indexOf(w) === i &&
							w.toLowerCase() !== headword.toLowerCase(),
					);

				if (matchingWords.length > 0) {
					text += `\n*Matching Words:*\n- ${matchingWords.slice(0, 6).join("\n- ")}`;
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
		description: "Send audio pronunciation clip",
		usage: ".pronounce <word>",

		async execute(msg, _args, sock) {
			const jid = msg.key.remoteJid;
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
				if (!audioRes.ok) {
					throw new Error(`HTTP ${audioRes.status}`);
				}

				const audioBuffer = Buffer.from(await audioRes.arrayBuffer());

				await sock.sendMessage(
					jid,
					{
						audio: audioBuffer,
						mimetype: "audio/wav",
						fileName: `${word}.wav`,
						ptt: false,
					},
					{ quoted: msg },
				);
			} catch (err) {
				console.error("Pronounce command error:", err);
				await sock.sendMessage(
					jid,
					{ text: "Failed to fetch pronunciation audio." },
					{ quoted: msg },
				);
			}
		},
	},
];
