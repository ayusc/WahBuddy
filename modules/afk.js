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
import { db } from "../main.js";

dotenv.config();

const TIME_ZONE = process.env.TIME_ZONE || "Asia/Kolkata";
const collectionName = "afk";
let afkCollection;

function setupAfkCollection() {
	if (!afkCollection) {
		afkCollection = db.collection(collectionName);
	}
}

export default {
	name: [".afk"],
	description: "Sets or removes AFK status with optional reason.",
	usage: ".afk on/yes [reason] | .afk off/no",
	async execute(msg, args, sock) {
		setupAfkCollection();

		const jid = msg.key.participant || msg.key.remoteJid;

		const subCommand = (args[0] || "").toLowerCase();

		if (subCommand === "on" || subCommand === "yes") {
			const reason = args.slice(1).join(" ").trim() || null;

			const afkData = await afkCollection.findOne({ isafk: true });
			if (afkData) {
				await sock.sendMessage(
					jid,
					{
						text: `You are already AFK!\nReason: ${afkData.afkreason || "No reason provided"}`,
					},
					{ quoted: msg },
				);
				return;
			}

			const newAfkData = {
				isafk: true,
				afkreason: reason,
				afktime: new Date(),
				afkRespondedUsers: [], // Reset replied users on AFK start
			};

			await afkCollection.updateOne({}, { $set: newAfkData }, { upsert: true });

			await sock.sendMessage(
				jid,
				{
					text: `You are now AFK.\n${reason ? `Reason: ${reason}` : "No reason provided."}`,
				},
				{ quoted: msg },
			);
		} else if (subCommand === "off" || subCommand === "no") {
			await afkCollection.updateOne(
				{},
				{
					$set: {
						isafk: false,
						afktime: null,
						afkreason: null,
						afkRespondedUsers: [], // Clear the responded list
					},
				},
				{ upsert: true },
			);

			await sock.sendMessage(
				jid,
				{ text: `Welcome back!\nYou are no longer AFK.` },
				{ quoted: msg },
			);
		}
	},
};

export async function handleAfkMessages(msg, sock) {
	setupAfkCollection();

	if (msg.key.fromMe) return;

	const afkData = await afkCollection.findOne({ isafk: true });
	if (!afkData) return;

	const senderJid = msg.key.participant || msg.key.remoteJid;
	const contextJid = msg.key.remoteJid;
	const contextKey = `${senderJid}__${contextJid}`;

	const alreadyReplied = afkData.afkRespondedUsers?.includes(contextKey);
	if (alreadyReplied) return;

	await afkCollection.updateOne(
		{},
		{ $addToSet: { afkRespondedUsers: contextKey } },
	);

	const reason = afkData.afkreason;
	const afkDate = new Date(afkData.afktime);
	const now = new Date();

	const formattedTime = afkDate.toLocaleString("en-IN", {
		hour: "2-digit",
		minute: "2-digit",
		hour12: true,
		timeZone: TIME_ZONE,
	});

	const afkDateInCity = new Date(
		afkDate.toLocaleString("en-US", { timeZone: TIME_ZONE }),
	);
	const nowInCity = new Date(
		now.toLocaleString("en-US", { timeZone: TIME_ZONE }),
	);

	const afkDay = new Date(
		afkDateInCity.getFullYear(),
		afkDateInCity.getMonth(),
		afkDateInCity.getDate(),
	);
	const today = new Date(
		nowInCity.getFullYear(),
		nowInCity.getMonth(),
		nowInCity.getDate(),
	);

	const diffDays = Math.floor((today - afkDay) / (1000 * 60 * 60 * 24));
	let timeString;

	if (diffDays === 0) {
		timeString = `Today at ${formattedTime}`;
	} else if (diffDays === 1) {
		timeString = `Yesterday at ${formattedTime}`;
	} else if (diffDays <= 7) {
		const weekdays = [
			"Sunday",
			"Monday",
			"Tuesday",
			"Wednesday",
			"Thursday",
			"Friday",
			"Saturday",
		];
		const dayName = weekdays[afkDateInCity.getDay()];
		timeString = `${dayName} at ${formattedTime}`;
	} else {
		const dateString = `${afkDateInCity.getDate().toString().padStart(2, "0")}:${(
			afkDateInCity.getMonth() + 1
		)
			.toString()
			.padStart(2, "0")}:${afkDateInCity.getFullYear()}`;
		timeString = `${formattedTime} on ${dateString}`;
	}

	const isGroup = msg.key.remoteJid.endsWith("@g.us");
	let shouldRespond = false;
	const myId = `${sock.user.id.split(":")[0]}@s.whatsapp.net`;

	if (isGroup) {
		const mentionedJids =
			msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
		const repliedParticipant =
			msg.message?.extendedTextMessage?.contextInfo?.participant;

		if (mentionedJids.includes(myId) || repliedParticipant === myId) {
			shouldRespond = true;
		}
	} else {
		shouldRespond = true;
	}

	if (shouldRespond) {
		let afkText = `*Hi there, this is a userbot !*\n\nMy master is AFK now.\n\n`;
		if (reason) {
			afkText += `He gave me this reason: ${reason}\n\n`;
		}
		afkText += `I last saw him: ${timeString}`;

		await sock.sendMessage(
			msg.key.remoteJid,
			{
				text: afkText,
			},
			{ quoted: msg },
		);
	}
}
