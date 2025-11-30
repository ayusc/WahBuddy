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

// Thanks for the quotes API
// https://github.com/LyoSU/quote-api

import path from "node:path";
import { fileURLToPath } from "node:url";
import axios from "axios";
import { getContentType } from "baileys";
import sharp from "sharp";
import { contactsCollection } from "../main.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default {
	name: ".quote",
	description:
		"Creates a quote sticker from a message and the next few (up to 5)",
	usage:
		"Type .quote in reply to a msg to make a sticker out of it.\n" +
		"Type .quote <1-5> in reply to a msg to quote the msg and next few msgs (upto 4)\n" +
		"Type .quote noname in reply to a msg to make a quote using phone number instead of profile name\n" +
		"Type .quote <1-5> noname in reply to a msg to quote the msg and next few msgs (upto 4) using phone numbers instead of profile names\n\n" +
		"Note: The command will skip any other messages except text even in case the message is a reply to non-text messages.",

	async execute(msg, args, sock) {
		const jid = msg.key.remoteJid;
		const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
		const quotedType = quoted && getContentType(quoted);

		const quotedText = (() => {
			if (quotedType === "conversation") return quoted.conversation;
			if (quotedType === "extendedTextMessage")
				return quoted.extendedTextMessage?.text;
			if (quotedType === "textMessage") return quoted.textMessage?.text;
			return null;
		})();

		if (!quotedText) {
			return await sock.sendMessage(
				jid,
				{ text: "Please reply to a text message." },
				{ quoted: msg },
			);
		}

		const useNumberAsName = args.includes("noname");
		const countArg = args.find((arg) => /^[1-5]$/.test(arg));
		const count = countArg ? Number(countArg) : 1;

		if (!quoted && count > 1) {
			return await sock.sendMessage(
				jid,
				{
					text: "Please reply to a message if you want to quote multiple messages.",
				},
				{ quoted: msg },
			);
		}

		if (count === 1) {
			try {
				const contextInfo = msg.message?.extendedTextMessage?.contextInfo;
				const senderId = contextInfo?.participant || msg.key.remoteJid;
				const contactName = await getName(sock, senderId, useNumberAsName);
				const avatar = await getProfilePicUrl(sock, senderId);

				let replyMessage = null;
				const quotedCtxInfo = quoted?.extendedTextMessage?.contextInfo;

				if (quotedCtxInfo?.quotedMessage) {
					const qMsg = quotedCtxInfo.quotedMessage;
					const qTextType = getContentType(qMsg);
					const qText =
						qTextType === "conversation"
							? qMsg.conversation
							: qTextType === "extendedTextMessage"
								? qMsg.extendedTextMessage?.text
								: null;

					const qSender = quotedCtxInfo.participant;
					if (qText) {
						const qName = await getName(sock, qSender, useNumberAsName);
						replyMessage = {
							name: qName,
							text: qText,
							entities: [],
							chatId: 123456789,
						};
					}
				}

				const messages = [
					{
						entities: [],
						avatar: true,
						from: {
							id: 1,
							name: contactName,
							photo: { url: avatar },
						},
						text: quotedText,
						replyMessage,
					},
				];

				return await sendQuoteSticker(messages, sock, jid, msg);
			} catch (err) {
				console.error("Quote generation error:", err);
				await sock.sendMessage(
					jid,
					{ text: "Something went wrong while generating the quote." },
					{ quoted: msg },
				);
			}
		}
	},
};

async function sendQuoteSticker(messages, sock, jid, quotedMsg) {
	const quoteJson = {
		type: "quote",
		format: "png",
		backgroundColor: "#FFFFFF",
		width: 512,
		height: 512,
		scale: 2,
		messages,
	};

	try {
		const res = await axios.post(
			"https://bot.lyo.su/quote/generate",
			quoteJson,
			{
				headers: { "Content-Type": "application/json" },
			},
		);

		const buffer = Buffer.from(res.data.result.image, "base64");

		const webpBuffer = await sharp(buffer)
			.resize(512, 512, {
				fit: "contain",
				background: { r: 0, g: 0, b: 0, alpha: 0 },
			})
			.webp({ quality: 100 })
			.toBuffer();

		await sock.sendMessage(jid, { sticker: webpBuffer });
	} catch (err) {
		console.error("Quote generation error:", err);
		await sock.sendMessage(
			jid,
			{ text: "Something went wrong while generating the quote." },
			{ quoted: quotedMsg },
		);
	}
}

async function getProfilePicUrl(sock, id, retries = 5, delay = 300) {
	const fallbackUrl =
		"https://i.ibb.co/d4qcHwdj/blank-profile-picture-973460-1280.png";

	for (let attempt = 1; attempt <= retries; attempt++) {
		try {
			const url = await sock.profilePictureUrl(id, "image");
			if (url) return url;
		} catch (_err) {
			if (attempt === retries) {
				console.warn(
					`Failed to get profile pic for ${id} after ${retries} attempts.`,
				);
			} else {
				await new Promise((resolve) => setTimeout(resolve, delay));
			}
		}
	}
	return fallbackUrl;
}

/**
 * Normalize JID by removing device suffix if present
 * e.g. "12345:33@s.whatsapp.net" → "12345@s.whatsapp.net"
 */
function normalizeJid(jid) {
	return jid.replace(/:\d+@/, "@");
}

async function getName(sock, id, useNumber) {
	if (useNumber) {
		return `+${id.split("@")[0]}`;
	}

	const rawJid = id.includes("@s.whatsapp.net") ? id : `${id}@s.whatsapp.net`;
	const jid = normalizeJid(rawJid);
	const ownerJid = sock.user?.id ? normalizeJid(sock.user.id) : null;

	if (ownerJid && jid === ownerJid) {
		return sock.user?.name || `+${jid.split("@")[0]}`;
	}

	const contact = await contactsCollection.findOne({ id: jid });

	return (
		contact?.pushName ||
		contact?.name ||
		contact?.notify ||
		`+${jid.split("@")[0]}`
	);
}
