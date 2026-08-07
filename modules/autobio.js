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

import dotenv from "dotenv";

dotenv.config();

const _TIME_ZONE = process.env.TIME_ZONE || "Asia/Kolkata";
const AUTO_BIO_INTERVAL =
	parseInt(process.env.AUTO_BIO_INTERVAL_MS, 10) || 60000;
const groq_key = process.env.GROQ_API_KEY;
let lastQuote = "";
let nextBio = null;
let isFetching = false;

function _getTimeInTimeZone(timeZone) {
	const now = new Date();
	const parts = new Intl.DateTimeFormat("en-US", {
		timeZone,
		hour12: false,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
	})
		.formatToParts(now)
		.reduce((acc, part) => {
			if (part.type !== "literal") acc[part.type] = part.value;
			return acc;
		}, {});

	return new Date(
		`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`,
	);
}

async function fetchBioAndEmoji() {
	try {
		const prompt = `Generate a completely random quote, thought, or saying under STRICTLY 50 characters and 1 matching emoji.
Rules:
1. Do NOT use out of scope emojis which has no connection to the quote.
2. Do NOT repeat or paraphrase: "${lastQuote}".
3. Pick an emoji that directly fits the tone/vibe of the quote.
4. Respond STRICTLY in this format with a pipe separator and NOTHING ELSE: EMOJI|QUOTE`;

		const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
			method: "POST",
			headers: {
				Authorization: `Bearer ${groq_key}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				model: "llama-3.1-8b-instant",
				messages: [{ role: "user", content: prompt }],
				temperature: 1.1,
			}),
		});

		if (!res.ok) throw new Error(`HTTP ${res.status}`);

		const data = await res.json();
		let text = data.choices[0]?.message?.content || "";
		text = text
			.replace(/```[a-z]*/gi, "")
			.replace(/```/g, "")
			.trim();

		const parts = text.split("|");
		if (parts.length >= 2) {
			const emoji = parts[0].trim();
			const quote = parts
				.slice(1)
				.join("|")
				.trim()
				.replace(/^["']|["']$/g, "");

			if (quote.length > 0 && quote.length <= 50 && emoji) {
				lastQuote = quote;
				return { quote, emoji };
			}
		}
		return null;
	} catch (error) {
		console.error("Error fetching quote from Groq:", error.message);
		return null;
	}
}

async function preloadBio() {
	if (nextBio || isFetching) return;
	isFetching = true;
	try {
		const res = await fetchBioAndEmoji();
		if (res) {
			nextBio = res;
		}
	} catch (err) {
		console.error("Preload error:", err.message);
	} finally {
		isFetching = false;
	}
}

async function performBioUpdate() {
	const sock = globalThis.sock;
	if (!sock) {
		console.warn("AutoBio: Socket Error.");
		return;
	}
	if (globalThis.connectionState !== "open") {
		console.warn("AutoBio: Connection unstable.");
		return;
	}

	let res = nextBio;
	nextBio = null;

	if (!res) {
		res = await fetchBioAndEmoji();
	}

	preloadBio();

	if (res) {
		try {
			await globalThis.profileLimiter.schedule(() =>
				sock.updateProfileStatus(res.quote, res.emoji, 3600),
			);
			console.log("About updated");
		} catch (err) {
			console.error("About update failed:", err.message);
		}
	}
}

export async function startAutoBio() {
	if (globalThis.autobioRunning) return;
	globalThis.autobioRunning = true;

	preloadBio();

	const runRecursiveLoop = async () => {
		if (!globalThis.autobioRunning) return;

		try {
			await performBioUpdate();
		} catch (err) {
			console.error("Error in autobio loop:", err);
		} finally {
			if (globalThis.autobioRunning) {
				const nextRunDelay =
					AUTO_BIO_INTERVAL - (Date.now() % AUTO_BIO_INTERVAL);
				globalThis.autobioInterval = setTimeout(runRecursiveLoop, nextRunDelay);
			}
		}
	};

	const now = Date.now();
	const delayToNextMinute = AUTO_BIO_INTERVAL - (now % AUTO_BIO_INTERVAL);
	globalThis.autobioInterval = setTimeout(runRecursiveLoop, delayToNextMinute);
}

export default [
	{
		name: ".autobio",
		description:
			"Start updating WhatsApp About with motivational quotes every X seconds",
		usage: 'Type .autobio in any chat to start updating WhatsApp "About"...',

		async execute(msg, _args, sock) {
			const jid = msg.key.remoteJid;

			if (globalThis.autobioRunning) {
				if (!msg.fromStartup) {
					await sock.sendMessage(
						jid,
						{ text: "AutoBio is already running!" },
						{ quoted: msg },
					);
				}
				return;
			}

			if (!msg.fromStartup) {
				await sock.sendMessage(
					jid,
					{
						text: `AutoBio started. Updating every ${AUTO_BIO_INTERVAL / 1000}s`,
					},
					{ quoted: msg },
				);
			}

			await startAutoBio(sock);
		},
	},
	{
		name: ".stopbio",
		description: 'Stop updating WhatsApp "About" automatically.',
		usage:
			"Type .stopbio in any chat to stop updating WhatsApp About automatically.",

		async execute(message, _args, sock) {
			if (globalThis.autobioInterval) {
				clearTimeout(globalThis.autobioInterval);
				globalThis.autobioInterval = null;
				globalThis.autobioRunning = false;
				await sock.sendMessage(
					message.key.remoteJid,
					{ text: "AutoBio stopped" },
					{ quoted: message },
				);
			} else {
				await sock.sendMessage(
					message.key.remoteJid,
					{ text: "AutoBio is not running" },
					{ quoted: message },
				);
			}
		},
	},
];
