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
import path from "node:path";
import { fileURLToPath } from "node:url";
import util from "node:util";
import dotenv from "dotenv";
import fetch from "node-fetch";

const execPromise = util.promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config();

const KOYEB_TOKEN = process.env.KOYEB_TOKEN;
const KOYEB_SERVICE_ID = process.env.KOYEB_SERVICE_ID;
const BRANCH = process.env.REPO_BRANCH || "main";

async function git_check() {
	try {
		await execPromise("git fetch origin");
		const { stdout: count } = await execPromise(
			`git rev-list --count HEAD..origin/${BRANCH}`,
		);
		if (parseInt(count.trim(), 10) === 0) return null;

		const { stdout: hashLog } = await execPromise(
			`git log HEAD..origin/${BRANCH} --format="%h"`,
		);
		const hashes = hashLog.trim().split("\n").filter(Boolean);

		const { stdout: details } = await execPromise(
			`git log origin/${BRANCH} -n 1 --format="%an|%cd|%s"`,
		);
		const [author, date, msg] = details.trim().split("|");

		const { stdout: files } = await execPromise(
			`git diff --name-only HEAD..origin/${BRANCH}`,
		);
		const fileList = files.trim().split("\n").filter(Boolean);

		return { hashes, author, date, msg, fileList };
	} catch (_e) {
		return null;
	}
}

async function reload_stuff(changed) {
	if (!globalThis.cmdMap) {
		throw new Error("Global command map missing");
	}

	const modulesDir = __dirname;
	const targets =
		changed.length > 0
			? changed
					.filter((f) => f.startsWith("modules/") && f.endsWith(".js"))
					.map((f) => path.basename(f))
			: fs.readdirSync(modulesDir).filter((f) => f.endsWith(".js"));

	if (targets.length === 0) return "No command modules to reload";

	let count = 0;

	for (const file of targets) {
		try {
			const targetPath = `./${file}?t=${Date.now()}`;
			const newMod = await import(targetPath);

			const cmds = Array.isArray(newMod.default)
				? newMod.default
				: [newMod.default];

			for (const cmd of cmds) {
				if (cmd.name && cmd.execute) {
					const names = Array.isArray(cmd.name) ? cmd.name : [cmd.name];
					for (const name of names) {
						globalThis.cmdMap.set(name, cmd);
					}
				}
			}
			count++;
		} catch (e) {
			console.error(`Failed to reload ${file}`, e);
		}
	}
	return `Reloaded ${count} modules`;
}

export default [
	{
		name: ".update",
		description: "Updates the userbot locally (Temporary).",
		usage: ".update",

		async execute(msg, _args, sock) {
			const jid = msg.key.remoteJid;
			const statusMsg = await sock.sendMessage(
				jid,
				{ text: "Checking for updates..." },
				{ quoted: msg },
			);

			try {
				const info = await git_check();

				if (!info) {
					return await sock.sendMessage(jid, {
						text: "Already up to date",
						edit: statusMsg.key,
					});
				}

				const label = info.hashes.length > 1 ? "Commits" : "Commit";
				const fileStr = info.fileList.map((f) => `- ${f}`).join("\n");

				const text =
					`Update Available\n\n` +
					`${label}: ${info.hashes.join(", ")}\n` +
					`Msg: ${info.msg}\n\n` +
					`Files:\n${fileStr}`;

				await sock.sendMessage(jid, { text: text, edit: statusMsg.key });

				await sock.sendMessage(
					jid,
					{ text: "Pulling changes..." },
					{ quoted: statusMsg },
				);
				await execPromise(`git pull origin ${BRANCH}`);

				if (info.fileList.some((f) => f.includes("package.json"))) {
					await sock.sendMessage(
						jid,
						{ text: "Installing dependencies..." },
						{ quoted: statusMsg },
					);
					await execPromise("npm install");
				}

				let resultMsg = "";
				const coreFiles = info.fileList.some(
					(f) =>
						f.includes("main.js") ||
						f.includes("auth.js") ||
						f.includes("package.json"),
				);

				if (coreFiles) {
					resultMsg =
						"\nCore files changed. Run .upgrade or .restart to apply fully.";
				} else {
					await sock.sendMessage(
						jid,
						{ text: "Hot-reloading commands..." },
						{ quoted: statusMsg },
					);
					const res = await reload_stuff(info.fileList);
					resultMsg = `\n${res}`;
				}

				await sock.sendMessage(jid, {
					text: `Done${resultMsg}`,
					edit: statusMsg.key,
				});
			} catch (e) {
				await sock.sendMessage(
					jid,
					{ text: `Error: ${e.message}` },
					{ quoted: msg },
				);
			}
		},
	},
	{
		name: ".upgrade",
		description: "Redeploy the userbot with new changes.",
		usage: ".upgrade",

		async execute(msg, _args, sock) {
			const jid = msg.key.remoteJid;

			if (!KOYEB_TOKEN || !KOYEB_SERVICE_ID) {
				return await sock.sendMessage(
					jid,
					{ text: "Missing Koyeb keys" },
					{ quoted: msg },
				);
			}

			const statusMsg = await sock.sendMessage(
				jid,
				{ text: "Connecting to Koyeb..." },
				{ quoted: msg },
			);

			try {
				const info = await git_check();
				let note = "";
				if (info) {
					note = `\n\nCommit: ${info.hashes[0]}\nMsg: ${info.msg}`;
				}

				const res = await fetch(
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

				if (!res.ok) {
					throw new Error(`${res.status} ${await res.text()}`);
				}

				await sock.sendMessage(jid, {
					text: `Build triggered${note}\nBot will restart in a few minutes`,
					edit: statusMsg.key,
				});
			} catch (e) {
				await sock.sendMessage(jid, {
					text: `Failed: ${e.message}`,
					edit: statusMsg.key,
				});
			}
		},
	},
	{
		name: ".restart",
		description: "Restart the userbot.",
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
