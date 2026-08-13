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

async function deleteKey(sock, jid, key) {
	try {
		await sock.sendMessage(jid, { delete: key });
		return true;
	} catch (_err) {
		return false;
	}
}

export default [
	{
		name: ".del",
		description: "Delete recent messages from a replied message, mentioned user, or whole group.",
		usage: ".del [count]\n• Reply to a message: .del 3\n• Mention a user: .del 5 @user\n• Group delete: .del 10",

		async execute(msg, args, sock) {
			const jid = msg.key.remoteJid;
			const senderJid = msg.key.participant || msg.key.remoteJid;

			const { isSenderAdmin, isBotAdmin } = await checkAdminStatus(sock, jid, senderJid);

			if (!isBotAdmin && jid.endsWith("@g.us")) {
				await sock.sendMessage(jid, { text: "I need to be an admin to delete messages." }, { quoted: msg });
				return;
			}

			if (!isSenderAdmin && jid.endsWith("@g.us")) {
				await sock.sendMessage(jid, { text: "Only admins can use the delete command." }, { quoted: msg });
				return;
			}

			const contextInfo = msg.message?.extendedTextMessage?.contextInfo || {};
			const quotedMsgId = contextInfo.stanzaId || null;
			const mentionedJid = Array.isArray(contextInfo.mentionedJid) && contextInfo.mentionedJid.length > 0 
				? contextInfo.mentionedJid[0] 
				: null;

			let requestedCount = parseInt(args[0], 10);
			if (isNaN(requestedCount) || requestedCount <= 0) {
				requestedCount = quotedMsgId || mentionedJid ? 1 : null;
			}

			if (requestedCount === null) {
				await sock.sendMessage(
					jid,
					{ text: "Please reply to a message to delete !" },
					{ quoted: msg }
				);
				return;
			}

			const purgeCount = Math.min(requestedCount, 50);
			const keysToDelete = [];
			let statusMsg = null;

			if (quotedMsgId) {
				let dbMsg = await messagesCollection.findOne({
					"key.id": quotedMsgId,
					"key.remoteJid": jid,
				});

				if (!dbMsg) {
					statusMsg = await sock.sendMessage(
						jid,
						{ text: "Waiting for the messages to appear in DB ..." },
						{ quoted: msg }
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
					if (statusMsg) {
						await sock.sendMessage(jid, {
							text: "Coudn't find the replied message(s) in DB ...\nPerhaps it has already been deleted ?",
							edit: statusMsg.key,
						});
					} else {
						await sock.sendMessage(
							jid,
							{ text: "Coudn't find the replied message(s) in DB ...\nPerhaps it has already been deleted ?" },
							{ quoted: msg }
						);
					}
					return;
				}

				const isRepliedRevoked = dbMsg.message?.protocolMessage || dbMsg.stubType === 68;
				if (requestedCount === 1 && isRepliedRevoked) {
					if (statusMsg) {
						await sock.sendMessage(jid, { text: "The replied message is already deleted !", edit: statusMsg.key });
					} else {
						await sock.sendMessage(jid, { text: "The replied message is already deleted !" }, { quoted: msg });
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
					const isRevoked = m.message?.protocolMessage || m.stubType === 68;
					if (!isRevoked) {
						keysToDelete.push(m.key);
					}
				}

				if (keysToDelete.length === 0) {
					const errorText = requestedCount === 1 
						? "The replied message is already deleted !" 
						: "The mesages were already deleted !";

					if (statusMsg) {
						await sock.sendMessage(jid, { text: errorText, edit: statusMsg.key });
					} else {
						await sock.sendMessage(jid, { text: errorText }, { quoted: msg });
					}
					return;
				}

			} else if (mentionedJid) {
				const targetMsgs = await messagesCollection
					.find({
						"key.remoteJid": jid,
						$or: [{ "key.participant": mentionedJid }, { "key.remoteJid": mentionedJid }],
					})
					.sort({ messageTimestamp: -1 })
					.limit(purgeCount + 5)
					.toArray();

				for (const m of targetMsgs) {
					if (keysToDelete.length >= purgeCount) break;
					const isRevoked = m.message?.protocolMessage || m.stubType === 68;
					if (!isRevoked) {
						keysToDelete.push(m.key);
					}
				}

				if (keysToDelete.length === 0) {
					await sock.sendMessage(jid, { text: "The mesages were already deleted !" }, { quoted: msg });
					return;
				}

			} else {
				const recentGroupMsgs = await messagesCollection
					.find({ "key.remoteJid": jid })
					.sort({ messageTimestamp: -1 })
					.limit(purgeCount + 5)
					.toArray();

				for (const m of recentGroupMsgs) {
					if (keysToDelete.length >= purgeCount) break;
					const isRevoked = m.message?.protocolMessage || m.stubType === 68;
					if (!isRevoked && m.key.id !== msg.key.id) {
						keysToDelete.push(m.key);
					}
				}

				if (keysToDelete.length === 0) {
					await sock.sendMessage(jid, { text: "The mesages were already deleted !" }, { quoted: msg });
					return;
				}
			}

			if (statusMsg) {
				keysToDelete.push(statusMsg.key);
			}

			keysToDelete.push(msg.key);

			const batchSize = 5;
			for (let i = 0; i < keysToDelete.length; i += batchSize) {
				const batch = keysToDelete.slice(i, i + batchSize);
				await Promise.all(batch.map((key) => deleteKey(sock, jid, key)));
				await new Promise((r) => setTimeout(r, 300));
			}
		},
	},
];
