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
import util from "node:util";
import fetch from "node-fetch";

const asyncExec = util.promisify(exec);
const KOYEB_TOKEN = process.env.KOYEB_TOKEN;
const KOYEB_SERVICE_ID = process.env.KOYEB_SERVICE_ID;
const REPO_BRANCH = process.env.REPO_BRANCH || "main";

async function getGitInfo() {
	try {
		await asyncExec("git fetch origin");

		const { stdout: count } = await asyncExec(
			`git rev-list --count HEAD..origin/${REPO_BRANCH}`,
		);
		const commitCount = parseInt(count.trim(), 10);

		if (commitCount === 0) return null;

		const { stdout: hashLog } = await asyncExec(
			`git log HEAD..origin/${REPO_BRANCH} --format="%h"`,
		);
		const hashes = hashLog.trim().split("\n").filter(Boolean);

		const { stdout: commitInfo } = await asyncExec(
			`git log origin/${REPO_BRANCH} -n 1 --format="%an|%cd|%s"`,
		);
		const [author, date, message] = commitInfo.trim().split("|");

		const { stdout: fileChanges } = await asyncExec(
			`git diff --name-only HEAD..origin/${REPO_BRANCH}`,
		);
		const files = fileChanges.trim().split("\n").filter(Boolean);

		return { hashes, author, date, message, files };
	} catch (err) {
		return null;
	}
}

export default [
	{
		name: ".update",
		description: "Update the bot from the repository",
		usage: ".update",

		async execute(msg, _args, sock) {
			const jid = msg.key.remoteJid;
			let sentMsg = await sock.sendMessage(
				jid,
				{ text: "Checking for updates..." },
				{ quoted: msg },
			);

			try {
				const info = await getGitInfo();

				if (!info) {
					return await sock.sendMessage(jid, {
						text: "Bot is already up to date.",
						edit: sentMsg.key,
					});
				}

				const hashLabel = info.hashes.length > 1 ? "Commits" : "Commit";
				const hashValue = info.hashes.join(", ");

				const updateText =
					`New Update Available\n\n` +
					`${hashLabel}: ${hashValue}\n` +
					`Author: ${info.author}\n` +
					`Date: ${info.date}\n` +
					`Message: ${info.message}\n\n` +
					`Files Changed:\n${info.files.map((f) => `- ${f}`).join("\n")}`;

				await sock.sendMessage(jid, { text: updateText, edit: sentMsg.key });
				await sock.sendMessage(
					jid,
					{ text: "Pulling changes..." },
					{ quoted: sentMsg },
				);

				await asyncExec(`git pull origin ${REPO_BRANCH}`);

				if (info.files.some((f) => f.includes("package.json"))) {
					await sock.sendMessage(
						jid,
						{ text: "Installing dependencies..." },
						{ quoted: sentMsg },
					);
					await asyncExec("npm install");
				}

				await sock.sendMessage(
					jid,
					{ text: "Restarting bot to apply changes..." },
					{ quoted: sentMsg },
				);
				process.exit(0);
			} catch (err) {
				await sock.sendMessage(
					jid,
					{ text: `Update Failed: ${err.message}` },
					{ quoted: msg },
				);
			}
		},
	},
	{
		name: ".upgrade",
		description: "Trigger a fresh build and redeploy on Koyeb",
		usage: ".upgrade",

		async execute(msg, _args, sock) {
			const jid = msg.key.remoteJid;

			if (!KOYEB_TOKEN || !KOYEB_SERVICE_ID) {
				return await sock.sendMessage(
					jid,
					{
						text: "Error: KOYEB_TOKEN or KOYEB_SERVICE_ID is missing in .env",
					},
					{ quoted: msg },
				);
			}

			let sentMsg = await sock.sendMessage(
				jid,
				{ text: "Connecting to Koyeb..." },
				{ quoted: msg },
			);

			try {
				const info = await getGitInfo();

				let details = "";
				if (info) {
					const hashLabel = info.hashes.length > 1 ? "Commits" : "Commit";
					const hashValue = info.hashes.join(", ");

					details =
						`\n\nDeploying New Version:\n` +
						`${hashLabel}: ${hashValue}\n` +
						`Message: ${info.message}\n` +
						`Files: ${info.files.length} changed`;
				}

				const response = await fetch(
					`https://app.koyeb.com/v1/services/${KOYEB_SERVICE_ID}/redeploy`,
					{
						method: "POST",
						headers: {
							"Content-Type": "application/json",
							Authorization: `Bearer ${KOYEB_TOKEN}`,
						},
						body: JSON.stringify({}),
					},
				);

				if (!response.ok) {
					const errText = await response.text();
					throw new Error(`Koyeb API Error: ${response.status} - ${errText}`);
				}

				await sock.sendMessage(jid, {
					text: `Build Triggered Successfully!${details}\n\nThe bot will restart once the build finishes.`,
					edit: sentMsg.key,
				});
			} catch (err) {
				await sock.sendMessage(jid, {
					text: `Upgrade Failed: ${err.message}`,
					edit: sentMsg.key,
				});
			}
		},
	},
	{
		name: ".restart",
		description: "Restart the bot process",
		usage: ".restart",

		async execute(msg, _args, sock) {
			await sock.sendMessage(
				msg.key.remoteJid,
				{ text: "Restarting the bot..." },
				{ quoted: msg },
			);
			process.exit(0);
		},
	},
];
