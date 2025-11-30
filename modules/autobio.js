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
import fetch from "node-fetch";

dotenv.config();

const _TIME_ZONE = process.env.TIME_ZONE || "Asia/Kolkata";
const AUTO_BIO_INTERVAL =
	parseInt(process.env.AUTO_BIO_INTERVAL_MS, 10) || 60000;

let lastQuote = "";

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

async function runQuoteUpdate() {
	try {
		let quote = "";
		let attempts = 0;

		while (!quote || quote.length > 139 || quote === lastQuote) {
			const res = await fetch("https://quotes-api-self.vercel.app/quote");
			const data = await res.json();
			quote = data.quote;
			attempts++;

			if (!quote) {
				console.log(`Attempt ${attempts}: Skipped - Empty quote`);
			} else if (quote === lastQuote) {
				console.log(`Attempt ${attempts}: Skipped - Duplicate quote`);
			} else if (quote.length > 139) {
				console.log(
					`Attempt ${attempts}: Skipped - Quote too long (${quote.length} chars)`,
				);
			}

			if (attempts >= 10) {
				console.warn(
					"Failed to find a new quote after 10 attempts. Skipping...",
				);
				return null;
			}
		}

		lastQuote = quote;
		//console.log(`Selected quote (attempt ${attempts}): "${quote}"`);
		return quote;
	} catch (error) {
		console.error("Error fetching quote:", error.message);
		return null;
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

	const q = await runQuoteUpdate();
	if (q) {
		try {
			//console.log('AutoBio: Queuing profile status update.');
			await globalThis.profileLimiter.schedule(() =>
				sock.updateProfileStatus(q),
			);
			console.log("About updated");
		} catch (err) {
			console.error("About update failed:", err.message);
		}
	}
}

export async function startAutoBio() {
	globalThis.autobioRunning = true;

	const runRecursiveLoop = async () => {
		try {
			await performBioUpdate();
		} catch (err) {
			console.error("Error in autobio loop:", err);
		} finally {
			const nextRunDelay = AUTO_BIO_INTERVAL - (Date.now() % AUTO_BIO_INTERVAL);
			globalThis.autobioInterval = setTimeout(runRecursiveLoop, nextRunDelay);
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
