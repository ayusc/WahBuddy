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

import { messagesCollection } from "../main.js";

function isRevokedMsg(m) {
	if (!m) return true;
	if (m.stubType === 68 || m.stubType === 1) return true;
	if (m.message?.protocolMessage?.type === 0) return true;
	return false;
}

async function checkAdminStatus(sock, jid, senderJid) {
	if (!jid.endsWith("@g.us")) return { isSenderAdmin: true, isBotAdmin: true };
	try {
		const metadata = await sock.groupMetadata(jid);
		const participants = metadata.participants || [];
		const botJid = sock.decodeJid(sock.user?.id);

		const sender = participants.find(
			(p) => sock.decodeJid(p.id) === sock.decodeJid(senderJid),
		);
		const bot = participants.find(
			(p) => sock.decodeJid(p.id) === sock.decodeJid(botJid),
		);

		return {
			isSenderAdmin: !!(sender?.admin || sender?.superadmin),
			isBotAdmin: !!(bot?.admin || bot?.superadmin),
		};
	} catch {
		return { isSenderAdmin: false, isBotAdmin: false };
	}
}

async function executeDeletion(sock, jid, messagesToDelete) {
	if (!messagesToDelete || messagesToDelete.length === 0) return;

	const isGroup = jid.endsWith("@g.us");

	if (isGroup) {
		const batchSize = 5;
		const forEveryoneKeys = messagesToDelete
			.filter((m) => !isRevokedMsg(m))
			.map((m) => m.key);

		for (let i = 0; i < forEveryoneKeys.length; i += batchSize) {
			const batch = forEveryoneKeys.slice(i, i + batchSize);
			await Promise.all(
				batch.map(async (key) => {
					try {
						await sock.sendMessage(jid, { delete: key });
					} catch (_e) {}
				}),
			);
			await new Promise((r) => setTimeout(r, 300));
		}
	}

	const clearItems = messagesToDelete.map((m) => ({
		id: m.key.id,
		fromMe: Boolean(m.key.fromMe),
		timestamp: m.messageTimestamp
			? String(m.messageTimestamp)
			: String(Math.floor(Date.now() / 1000)),
	}));

	try {
		await sock.chatModify(
			{
				clear: {
					messages: clearItems,
				},
			},
			jid,
		);
	} catch (_e) {
		for (const item of clearItems) {
			try {
				await sock.chatModify(
					{
						clear: {
							messages: [item],
						},
					},
					jid,
				);
			} catch (_err) {}
		}
	}
}

async function waitForDbMsg(jid, quotedMsgId, msg, sock) {
	let dbMsg = await messagesCollection.findOne({
		"key.id": quotedMsgId,
		"key.remoteJid": jid,
	});

	let statusMsg = null;
	if (!dbMsg) {
		statusMsg = await sock.sendMessage(
			jid,
			{ text: "Waiting for the messages to appear in DB ..." },
			{ quoted: msg },
		);

		for (let attempt = 1; attempt <= 10; attempt++) {
			await new Promise((r) => setTimeout(r, 12000));
			dbMsg = await messagesCollection.findOne({
				"key.id": quotedMsgId,
				"key.remoteJid": jid,
			});
			if (dbMsg) break;
		}
	}

	if (!dbMsg) {
		const failText =
			"Coudn't find the replied message(s) in DB ...\nPerhaps it has already been deleted ?";
		if (statusMsg) {
			await sock.sendMessage(jid, { text: failText, edit: statusMsg.key });
		} else {
			await sock.sendMessage(jid, { text: failText }, { quoted: msg });
		}
	}

	return { dbMsg, statusMsg };
}

export default [
	{
		name: ".del",
		description:
			"Delete recent messages before command, or from a replied message.",
		usage:
			".del [count] [me]\n• .del 5 - Delete last 5 messages + command\n• .del 5 me - Delete last 5 of MY messages + command\n• Reply to msg + .del - Delete replied msg + command",

		async execute(msg, args, sock) {
			const jid = msg.key.remoteJid;
			const senderJid = msg.key.participant || msg.key.remoteJid;

			const { isSenderAdmin, isBotAdmin } = await checkAdminStatus(
				sock,
				jid,
				senderJid,
			);

			if (!isBotAdmin && jid.endsWith("@g.us")) {
				await sock.sendMessage(
					jid,
					{ text: "I need to be an admin to delete messages." },
					{ quoted: msg },
				);
				return;
			}

			if (!isSenderAdmin && jid.endsWith("@g.us")) {
				await sock.sendMessage(
					jid,
					{ text: "Only admins can use the delete command." },
					{ quoted: msg },
				);
				return;
			}

			const isMeOnly = args.some((arg) => arg.toLowerCase() === "me");
			const numArg = args.find((arg) => !isNaN(parseInt(arg, 10)));

			const contextInfo = msg.message?.extendedTextMessage?.contextInfo || {};
			const quotedMsgId = contextInfo.stanzaId || null;

			let requestedCount = numArg ? parseInt(numArg, 10) : null;
			if (
				(requestedCount === null || isNaN(requestedCount)) &&
				quotedMsgId
			) {
				requestedCount = 1;
			}

			if (requestedCount === null && !quotedMsgId && !isMeOnly) {
				await sock.sendMessage(
					jid,
					{ text: "Please reply to a message to delete !" },
					{ quoted: msg },
				);
				return;
			}

			if (requestedCount === null && isMeOnly) {
				requestedCount = 1;
			}

			const purgeCount = Math.min(requestedCount, 50);
			const targetMessages = [];
			let statusMsg = null;

			if (quotedMsgId) {
				const result = await waitForDbMsg(jid, quotedMsgId, msg, sock);
				const dbMsg = result.dbMsg;
				statusMsg = result.statusMsg;

				if (!dbMsg) return;

				if (requestedCount === 1 && isRevokedMsg(dbMsg)) {
					const errText = "The replied message is already deleted !";
					if (statusMsg) {
						await sock.sendMessage(jid, {
							text: errText,
							edit: statusMsg.key,
						});
					} else {
						await sock.sendMessage(
							jid,
							{ text: errText },
							{ quoted: msg },
						);
					}
					return;
				}

				const followingMsgs = await messagesCollection
					.find({
						"key.remoteJid": jid,
						messageTimestamp: { $gte: dbMsg.messageTimestamp },
					})
					.sort({ messageTimestamp: 1 })
					.limit(purgeCount)
					.toArray();

				for (const m of followingMsgs) {
					if (isMeOnly && !m.key.fromMe) continue;
					targetMessages.push(m);
				}

				if (targetMessages.length === 0) {
					const errText =
						requestedCount === 1
							? "The replied message is already deleted !"
							: "The mesages were already deleted !";
					if (statusMsg) {
						await sock.sendMessage(jid, {
							text: errText,
							edit: statusMsg.key,
						});
					} else {
						await sock.sendMessage(
							jid,
							{ text: errText },
							{ quoted: msg },
						);
					}
					return;
				}

			} else {
				const candidates = await messagesCollection
					.find({ "key.remoteJid": jid })
					.sort({ messageTimestamp: -1 })
					.limit(purgeCount * 3 + 10)
					.toArray();

				for (const m of candidates) {
					if (targetMessages.length >= purgeCount) break;
					if (m.key.id === msg.key.id) continue;
					if (isMeOnly && !m.key.fromMe) continue;

					targetMessages.push(m);
				}

				if (targetMessages.length === 0) {
					await sock.sendMessage(
						jid,
						{ text: "The mesages were already deleted !" },
						{ quoted: msg },
					);
					return;
				}
			}

			if (statusMsg) targetMessages.push(statusMsg);
			targetMessages.push(msg);

			await executeDeletion(sock, jid, targetMessages);
		},
	},
	{
		name: ".delall",
		description:
			"Delete replied message and every message after that.",
		usage:
			".delall [me]\n• Reply to msg + .delall - Delete replied msg and all subsequent msgs\n• Reply to msg + .delall me - Delete ONLY your msgs from replied msg onwards",

		async execute(msg, args, sock) {
			const jid = msg.key.remoteJid;
			const senderJid = msg.key.participant || msg.key.remoteJid;

			const { isSenderAdmin, isBotAdmin } = await checkAdminStatus(
				sock,
				jid,
				senderJid,
			);

			if (!isBotAdmin && jid.endsWith("@g.us")) {
				await sock.sendMessage(
					jid,
					{ text: "I need to be an admin to delete messages." },
					{ quoted: msg },
				);
				return;
			}

			if (!isSenderAdmin && jid.endsWith("@g.us")) {
				await sock.sendMessage(
					jid,
					{ text: "Only admins can use the delete command." },
					{ quoted: msg },
				);
				return;
			}

			const contextInfo = msg.message?.extendedTextMessage?.contextInfo || {};
			const quotedMsgId = contextInfo.stanzaId || null;

			if (!quotedMsgId) {
				await sock.sendMessage(
					jid,
					{
						text: "Please reply to a message to delete the message and every messages after that !",
					},
					{ quoted: msg },
				);
				return;
			}

			const isMeOnly = args.some((arg) => arg.toLowerCase() === "me");

			const result = await waitForDbMsg(jid, quotedMsgId, msg, sock);
			const dbMsg = result.dbMsg;
			const statusMsg = result.statusMsg;

			if (!dbMsg) return;

			const subsequentMsgs = await messagesCollection
				.find({
					"key.remoteJid": jid,
					messageTimestamp: { $gte: dbMsg.messageTimestamp },
				})
				.sort({ messageTimestamp: 1 })
				.toArray();

			const targetMessages = [];
			for (const m of subsequentMsgs) {
				if (isMeOnly && !m.key.fromMe) continue;
				targetMessages.push(m);
			}

			if (targetMessages.length === 0) {
				const errText = "The mesages were already deleted !";
				if (statusMsg) {
					await sock.sendMessage(jid, {
						text: errText,
						edit: statusMsg.key,
					});
				} else {
					await sock.sendMessage(
						jid,
						{ text: errText },
						{ quoted: msg },
					);
				}
				return;
			}

			if (statusMsg) targetMessages.push(statusMsg);
			targetMessages.push(msg);

			await executeDeletion(sock, jid, targetMessages);
		},
	},
];
