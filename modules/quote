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
import { getContentType, downloadContentFromMessage } from "baileys";
import sharp from "sharp";
import { contactsCollection, messagesCollection } from "../main.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_FALLBACK_AVATAR = "https://i.ibb.co/d4qcHwdj/blank-profile-picture-973460-1280.png";

function extractText(message) {
	if (!message) return "";
	const type = getContentType(message);

	switch (type) {
		case "conversation":
			return message.conversation || "";
		case "extendedTextMessage":
			return message.extendedTextMessage?.text || "";
		case "imageMessage":
			return message.imageMessage?.caption || "";
		case "videoMessage":
			return message.videoMessage?.caption || "";
		case "documentMessage":
			return message.documentMessage?.caption || "";
		default:
			return "";
	}
}

async function getMediaBase64(message, cropMedia) {
	if (!message) return null;
	const type = getContentType(message);

	if (type !== "imageMessage" && type !== "stickerMessage") return null;

	try {
		const stream = await downloadContentFromMessage(
			message[type],
			type === "imageMessage" ? "image" : "sticker",
		);
		let buffer = Buffer.from([]);
		for await (const chunk of stream) {
			buffer = Buffer.concat([buffer, chunk]);
		}

		if (cropMedia && type === "imageMessage") {
			buffer = await sharp(buffer)
				.resize(512, 512, { fit: "cover" })
				.jpeg()
				.toBuffer();
		} else {
			buffer = await sharp(buffer).jpeg().toBuffer();
		}

		return `data:image/jpeg;base64,${buffer.toString("base64")}`;
	} catch (err) {
		return null;
	}
}

function normalizeJid(jid) {
	return jid ? jid.replace(/:\d+@/, "@") : "";
}

async function getName(sock, id, useNumber) {
	if (!id) return "Unknown";
	const phone = id.split("@")[0].split(":")[0];
	if (useNumber) return `+${phone}`;

	const rawJid = id.includes("@s.whatsapp.net") ? id : `${phone}@s.whatsapp.net`;
	const normalized = normalizeJid(rawJid);
	const ownerJid = sock.user?.id ? normalizeJid(sock.user.id) : null;

	if (ownerJid && normalized === ownerJid) {
		return sock.user?.name || `+${phone}`;
	}

	try {
		const contact = await contactsCollection.findOne({ id: normalized });
		return contact?.pushName || contact?.name || contact?.notify || `+${phone}`;
	} catch {
		return `+${phone}`;
	}
}

async function getProfilePicUrl(sock, id) {
	if (!id) return DEFAULT_FALLBACK_AVATAR;
	try {
		const url = await sock.profilePictureUrl(id, "image");
		return url || DEFAULT_FALLBACK_AVATAR;
	} catch (_err) {
		return DEFAULT_FALLBACK_AVATAR;
	}
}

export default {
	name: [".quote", ".q"],
	description: "Creates a quote sticker from the provided message(s)",
	usage:
		".q [count] [args]\n" +
		"Count: 3 (down), -3 (up)\n" +
		"Colors: red, blue, green, #hex\n" +
		"Media: m (include), c (crop)\n" +
		"Replies: r (show replies)\n" +
		"Quality: s3.2 (scale)\n" +
		"Names: noname",

	async execute(msg, args, sock) {
		const jid = msg.key.remoteJid;
		const contextInfo = msg.message?.extendedTextMessage?.contextInfo;
		const quotedMsgId = contextInfo?.stanzaId || null;
		const quoted = contextInfo?.quotedMessage || null;

		if (!quotedMsgId || !quoted) {
			return await sock.sendMessage(
				jid,
				{ text: "Please reply to a message to generate a quote." },
				{ quoted: msg },
			);
		}

		let count = 1;
		let isBackward = false;
		let scale = 2;
		let bgColor = "#ffffff";
		let includeMedia = false;
		let cropMedia = false;
		let showReplies = false;
		let useNumberAsName = false;

		const colorMap = {
			red: "#ff5733",
			blue: "#3385ff",
			green: "#4CAF50",
			black: "#000000",
			white: "#ffffff",
			yellow: "#FFEB3B",
			purple: "#cbafff",
		};

		args.forEach((arg) => {
			const lower = arg.toLowerCase();
			if (/^-?\d+$/.test(lower)) {
				count = Math.abs(parseInt(lower, 10));
				if (lower.startsWith("-")) isBackward = true;
			} else if (/^s\d+(\.\d+)?$/.test(lower)) {
				scale = Math.min(parseFloat(lower.replace("s", "")), 5);
			} else if (lower === "m") {
				includeMedia = true;
			} else if (lower === "c") {
				includeMedia = true;
				cropMedia = true;
			} else if (lower === "r") {
				showReplies = true;
			} else if (lower === "noname") {
				useNumberAsName = true;
			} else if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/.test(lower)) {
				bgColor = lower;
			} else if (colorMap[lower]) {
				bgColor = colorMap[lower];
			}
		});

		count = Math.min(Math.max(count, 1), 30);

		try {
			let messagesList = [];

			let dbMsg = null;
			for (let attempt = 1; attempt <= 5; attempt++) {
				dbMsg = await messagesCollection.findOne({
					"key.id": quotedMsgId,
					"key.remoteJid": jid,
				});
				if (dbMsg) break;
				await new Promise((r) => setTimeout(r, 1000));
			}

			if (dbMsg) {
				const query = { "key.remoteJid": jid };
				if (isBackward) {
					query.messageTimestamp = { $lte: dbMsg.messageTimestamp };
				} else {
					query.messageTimestamp = { $gte: dbMsg.messageTimestamp };
				}

				const rawMsgs = await messagesCollection
					.find(query)
					.sort({ messageTimestamp: isBackward ? -1 : 1 })
					.limit(count)
					.toArray();

				if (isBackward) rawMsgs.reverse();

				for (const m of rawMsgs) {
					const text = extractText(m.message);
					const hasMedia = ["imageMessage", "stickerMessage"].includes(getContentType(m.message));
					if (text || (includeMedia && hasMedia)) {
						messagesList.push(m);
					}
				}
			}

			if (messagesList.length === 0) {
				const sender = contextInfo.participant || jid;
				messagesList.push({
					key: { participant: sender, remoteJid: jid, id: quotedMsgId },
					message: quoted,
				});
			}

			const apiMessages = [];
			let prevSender = null;

			for (let i = 0; i < messagesList.length; i++) {
				const m = messagesList[i];
				const senderId = m.key.participant || m.key.remoteJid || jid;
				const normalizedSender = normalizeJid(senderId);
				let text = extractText(m.message);

				const msgType = getContentType(m.message);
				if (!text && !includeMedia) {
					if (msgType === "imageMessage") text = "Photo";
					else if (msgType === "videoMessage") text = "Video";
					else if (msgType === "stickerMessage") text = "Sticker";
					else if (msgType === "audioMessage") text = "Audio";
					else if (msgType === "documentMessage") text = "Document";
					else text = "Message";
				}

				const contactName = await getName(sock, senderId, useNumberAsName);
				const avatarUrl = await getProfilePicUrl(sock, senderId);

				const showAvatar = prevSender !== normalizedSender;
				prevSender = normalizedSender;

				let replyMessage = null;

				if (showReplies && m.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
					const qCtx = m.message.extendedTextMessage.contextInfo;
					const qMsg = qCtx.quotedMessage;
					const qType = getContentType(qMsg);
					let qText = extractText(qMsg);

					if (!qText) {
						if (qType === "imageMessage") qText = "Photo";
						else if (qType === "videoMessage") qText = "Video";
						else if (qType === "stickerMessage") qText = "Sticker";
						else if (qType === "audioMessage") qText = "Audio";
						else if (qType === "documentMessage") qText = "Document";
						else qText = "Message";
					}

					const qSender = qCtx.participant;
					if (qText && qSender) {
						const qName = await getName(sock, qSender, useNumberAsName);
						replyMessage = {
							name: qName,
							text: qText,
							entities: [],
							chatId: 10001,
						};
					}
				}

				const numericId = parseInt(senderId.replace(/\D/g, ""), 10) || 10001;
				const msgObj = {
					entities: [],
					avatar: showAvatar,
					from: {
						id: numericId,
						first_name: contactName,
						last_name: "",
						name: contactName,
						photo: { url: avatarUrl },
					},
					text,
					replyMessage,
				};

				if (includeMedia) {
					const base64Media = await getMediaBase64(m.message, cropMedia);
					if (base64Media) {
						msgObj.media = [{ url: base64Media }];
					}
				}

				apiMessages.push(msgObj);
			}

			const quoteJson = {
				type: "quote",
				format: "png",
				backgroundColor: bgColor,
				width: 512,
				height: 512,
				scale: scale,
				messages: apiMessages,
			};

			const res = await axios.post("https://quote.yuri.ly/generate", quoteJson, {
				headers: { "Content-Type": "application/json" },
				timeout: 15000,
			});

			const base64Image = res.data?.image || res.data?.result?.image;
			if (!base64Image) {
				throw new Error("API returned an empty payload.");
			}

			const imageBuffer = Buffer.from(base64Image, "base64");

			const webpBuffer = await sharp(imageBuffer)
				.resize(512, 512, {
					fit: "contain",
					background: { r: 0, g: 0, b: 0, alpha: 0 },
				})
				.webp({ quality: 100 })
				.toBuffer();

			await sock.sendMessage(jid, { sticker: webpBuffer }, { quoted: msg });
		} catch (err) {
			await sock.sendMessage(
				jid,
				{ text: "Failed to generate quote sticker. Please try again." },
				{ quoted: msg },
			);
		}
	},
};
