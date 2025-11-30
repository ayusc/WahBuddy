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

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
	Browsers,
	DisconnectReason,
	fetchLatestBaileysVersion,
	makeWASocket,
	useMultiFileAuthState,
} from "baileys";
import Bottleneck from "bottleneck";
import dotenv from "dotenv";
import { MongoClient } from "mongodb";
import pino from "pino";
import qrcode from "qrcode";
import { initAuth, io, server } from "./auth.js";
import { handleAfkMessages } from "./modules/afk.js";
import { startAutoBio } from "./modules/autobio.js";
import { startAutoDP } from "./modules/autodp.js";
import { startAutoName } from "./modules/autoname.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
let autoDPStarted = false;
let autoBioStarted = false;
let autoNameStarted = false;
const autoDP = process.env.ALWAYS_AUTO_DP || "False";
const autobio = process.env.ALWAYS_AUTO_BIO || "False";
const autoname = process.env.ALWAYS_AUTO_NAME || "False";
const mongoUri = process.env.MONGO_URI;
const SITE_URL = process.env.SITE_URL;
const authDir = "./wahbuddy-auth";
const dbName = "wahbuddy";
let db, sessionCollection, stagingsessionCollection;

const debounce = (fn, delay) => {
	let timer;
	return (...args) => {
		clearTimeout(timer);
		timer = setTimeout(() => fn(...args), delay);
	};
};

let loggedIn = false;
let lastQR = null;
let lastQrDataUrl = null;
let lastQrTimestamp = 0;
let qrLogPrinted = false;
globalThis.sock = null;

function startSelfPing() {
	if (!SITE_URL) {
		console.error("SITE_URL is not set. Please set it first !");
		return;
	}
	const pingInterval = 5 * 60 * 1000;
	let cleanSiteUrl = SITE_URL;
	if (
		!cleanSiteUrl.startsWith("http://") &&
		!cleanSiteUrl.startsWith("https://")
	) {
		cleanSiteUrl = `https://${cleanSiteUrl}`;
	}

	const pingUrl = `${cleanSiteUrl}/health`;
	setInterval(async () => {
		try {
			const response = await fetch(pingUrl);
			if (!response.ok) {
				console.error(`Self-ping failed: ${response.statusText}`);
			} else {
			}
		} catch (err) {
			console.error("Self-ping error:", err.message);
		}
	}, pingInterval);
}

async function saveAuthStateToMongo(attempt = 1) {
	try {
		if (!fs.existsSync(authDir)) {
			return;
		}

		const staging = db.collection("wahbuddy_sessions_staging");
		const main = sessionCollection;

		const files = fs.readdirSync(authDir);

		const operations = files.map(async (file) => {
			const filePath = path.join(authDir, file);
			const data = await fs.promises.readFile(filePath, "utf-8");
			return staging.updateOne(
				{ _id: file },
				{ $set: { data } },
				{ upsert: true },
			);
		});

		await Promise.all(operations);

		const staged = await staging.find({}).toArray();

		if (staged.length > 0) {
			const bulkOps = staged.map((doc) => ({
				updateOne: {
					filter: { _id: doc._id },
					update: { $set: { data: doc.data } },
					upsert: true,
				},
			}));
			await main.bulkWrite(bulkOps);
		}

		await staging.deleteMany({});
		// console.log('Session credentials successfully saved/updated in MongoDB.');
	} catch (err) {
		if (attempt < 5) {
			// console.warn(`Retrying creds update... attempt ${attempt + 1}`);
			await new Promise((r) => setTimeout(r, 2000));
			await saveAuthStateToMongo(attempt + 1);
		} else {
			console.error(
				`Failed to update creds in MongoDB after ${attempt} attempts:`,
				err,
			);
		}
	}
}

async function restoreAuthStateFromMongo() {
	if (fs.existsSync(authDir))
		await fs.promises.rm(authDir, { recursive: true, force: true });
	await fs.promises.mkdir(authDir, { recursive: true });

	if (!sessionCollection) {
		console.error("Failed to connect to MongoDB !");
		initialConnect = true;
		return false;
	}

	const savedCreds = await sessionCollection.find({}).toArray();
	if (!savedCreds.length) {
		console.warn("No session found in MongoDB! Starting fresh.");
		initialConnect = true;
		return false;
	}

	try {
		await Promise.all(
			savedCreds.map(({ _id, data }) =>
				fs.promises.writeFile(path.join(authDir, _id), data, "utf-8"),
			),
		);
		console.log("Session restored from MongoDB");
		return true;
	} catch (err) {
		console.error("Failed to restore session from MongoDB:", err);
		await sessionCollection.deleteMany({});
		await stagingsessionCollection.deleteMany({});
		if (fs.existsSync(authDir))
			await fs.promises.rm(authDir, { recursive: true, force: true });
		await fs.promises.mkdir(authDir, { recursive: true });

		initialConnect = true;
		return false;
	}
}

export let chatsCollection;
export let messagesCollection;
export let contactsCollection;

let mongoConnected = false;
let commandsLoaded = false;
let initialConnect = true;

globalThis.profileLimiter = new Bottleneck({ maxConcurrent: 1, minTime: 3000 });
globalThis.connectionState = "connecting";

const commands = new Map();

async function loadCommands() {
	if (commandsLoaded) return commands;

	const modulesPath = path.join(__dirname, "modules");
	const moduleFiles = fs
		.readdirSync(modulesPath)
		.filter((file) => file.endsWith(".js"));

	for (const file of moduleFiles) {
		const module = await import(`./modules/${file}`);

		const entries = Array.isArray(module.default)
			? module.default
			: [module.default];

		for (const cmd of entries) {
			if (cmd.name && cmd.execute) {
				const names = Array.isArray(cmd.name) ? cmd.name : [cmd.name];
				for (const name of names) {
					commands.set(name, cmd);
					if (initialConnect) {
						const cleanName = name.startsWith(".") ? name.slice(1) : name;
						console.log(`Loaded Module: ${cleanName}`);
					}
				}
			}
		}
	}
	commandsLoaded = true;
	return commands;
}

export function getAllCommands() {
	const seen = new Set();
	const uniqueCommands = [];
	for (const cmd of commands.values()) {
		if (!seen.has(cmd)) {
			uniqueCommands.push(cmd);
			seen.add(cmd);
		}
	}
	return uniqueCommands;
}

async function startBot() {
	const mongoClient = new MongoClient(mongoUri);
	if (!mongoConnected) {
		await mongoClient.connect();
		mongoConnected = true;
		if (initialConnect) console.log("Connected to MongoDB");
	}
	db = mongoClient.db(dbName);
	sessionCollection = db.collection("wahbuddy_sessions");
	stagingsessionCollection = db.collection("wahbuddy_sessions_staging");
	chatsCollection = db.collection("chats");
	messagesCollection = db.collection("messages");
	contactsCollection = db.collection("contacts");

	initAuth(() => loggedIn);

	io.on("connection", (socket) => {
		if (lastQrDataUrl) {
			socket.emit("qr", lastQrDataUrl);
			socket.emit("qr-meta", {
				ts: lastQrTimestamp,
				qrLen: lastQR?.length || 0,
			});
		}
	});

	const _restored = await restoreAuthStateFromMongo();

	const [{ version }, { state, saveCreds }] = await Promise.all([
		fetchLatestBaileysVersion(),
		useMultiFileAuthState(authDir),
	]);

	const getMessage = async (key) => {
		const message = await messagesCollection.findOne({
			"key.id": key.id,
			"key.remoteJid": key.remoteJid,
			"key.fromMe": key.fromMe,
		});
		return message?.message || null;
	};

	const sock = makeWASocket({
		version,
		auth: state,
		browser: Browsers.ubuntu("Chrome"),
		syncFullHistory: false,
		getMessage,
		generateHighQualityLinkPreview: true,
		logger: pino({ level: "silent" }),
		defaultQueryTimeoutMs: undefined,
		markOnlineOnConnect: false,
	});

	globalThis.sock = sock;

	sock.ev.on(
		"creds.update",
		debounce(async () => {
			await saveCreds();
			await saveAuthStateToMongo();
		}, 1000),
	);

	sock.ev.on("connection.update", async (update) => {
		const { connection, lastDisconnect, qr } = update;

		if (connection) globalThis.connectionState = connection;

		// --- QR handling ---
		if (qr && qr !== lastQR) {
			lastQR = qr;
			loggedIn = false;
			lastQrTimestamp = Date.now();

			qrcode
				.toDataURL(qr)
				.then((qrDataUrl) => {
					lastQrDataUrl = qrDataUrl;
					io.emit("qr", qrDataUrl);
					io.emit("qr-meta", { ts: lastQrTimestamp, qrLen: qr.length });
				})
				.catch((err) => {
					console.error("Failed to generate QR image:", err);
					lastQrDataUrl = null;
					io.emit("qr-raw", qr);
				});

			if (!qrLogPrinted) {
				console.log(`Please visit ${SITE_URL} to get the login instructions.`);
				qrLogPrinted = true;
			}

			// Expire the buffered QR after ~65s
			setTimeout(() => {
				if (lastQrTimestamp && Date.now() - lastQrTimestamp > 65_000) {
					lastQR = null;
					lastQrDataUrl = null;
					lastQrTimestamp = 0;
				}
			}, 66_000);
		}

		if (connection === "close") {
			loggedIn = false;
			qrLogPrinted = false;
			commandsLoaded = false;

			clearInterval(globalThis.autodpInterval);
			clearInterval(globalThis.autobioInterval);
			clearInterval(globalThis.autonameInterval);
			globalThis.autodpInterval = null;
			globalThis.autobioInterval = null;
			globalThis.autonameInterval = null;
			autoDPStarted = false;
			autoBioStarted = false;
			autoNameStarted = false;

			const reason = lastDisconnect?.error?.output?.statusCode;

			if (reason === DisconnectReason.loggedOut) {
				if (initialConnect) {
					console.log(
						"Restored session is invalid. Clearing session and restarting for new login...",
					);
				} else {
					console.log(
						"Logged out permanently or session crashed !\nYou need to login again.",
					);
				}

				loggedIn = false;

				lastQR = null;
				lastQrDataUrl = null;
				lastQrTimestamp = 0;

				if (fs.existsSync(authDir))
					await fs.promises.rm(authDir, { recursive: true, force: true });
				await sessionCollection.deleteMany({});
				await stagingsessionCollection.deleteMany({});
				console.log("Restarting bot...");
				await startBot();
			} else if (
				reason === 440 ||
				reason === 500 ||
				reason === 428 ||
				reason === DisconnectReason.timedOut ||
				reason === DisconnectReason.restartRequired
			) {
				console.log(`Connection closed due to: ${reason}, Restarting bot...`);

				if (!globalThis.reconnecting) {
					globalThis.reconnecting = true;
					setTimeout(async () => {
						globalThis.reconnecting = false;
						await startBot();
					}, 5000);
				}
			} else {
				console.log(
					`Connection closed due to: ${reason}, restart not required !`,
				);
			}
		} else if (connection === "open") {
			qrLogPrinted = false;
			loggedIn = true;
			lastQR = null;
			lastQrDataUrl = null;
			lastQrTimestamp = 0;

			io.emit("login-success");
			console.log("Authenticated with WhatsApp");

			if (!commandsLoaded) {
				await loadCommands();
			}

			if (initialConnect) {
				console.log("WahBuddy is Online!");
			}

			initialConnect = false;

			// Start AutoDP if enabled
			if (!autoDPStarted && autoDP === "True" && commands.has(".autodp")) {
				autoDPStarted = true;
				try {
					startAutoDP();
				} catch (error) {
					console.error(`AutoDP Error: ${error.message}`);
				}
			}

			// Start AutoName if enabled
			if (
				!autoNameStarted &&
				autoname === "True" &&
				commands.has(".autoname")
			) {
				autoNameStarted = true;
				try {
					startAutoName();
				} catch (error) {
					console.error(`AutoName Error: ${error.message}`);
				}
			}

			// Start AutoBio if enabled
			if (!autoBioStarted && autobio === "True" && commands.has(".autobio")) {
				autoBioStarted = true;
				try {
					startAutoBio();
				} catch (error) {
					console.error(`AutoBio Error: ${error.message}`);
				}
			}

			console.log("Saving session to MongoDB...");
			saveAuthStateToMongo()
				.then(() => console.log("Session saved to MongoDB."))
				.catch((err) => console.error("Failed to save session to Mongo:", err));
		}
	});

	sock.ev.on("chats.upsert", async (chats) => {
		for (const chat of chats) {
			await chatsCollection.updateOne(
				{ id: chat.id },
				{ $set: chat },
				{ upsert: true },
			);
		}
	});

	sock.ev.on("messages.upsert", async ({ messages, type }) => {
		if (!messages || !messages.length) return;

		for (const msg of messages) {
			await messagesCollection.updateOne(
				{ "key.id": msg.key.id },
				{ $set: msg },
				{ upsert: true },
			);
		}

		if (type !== "notify") return;

		const msg = messages[0];
		if (!msg.message) return;

		if (!msg.key.fromMe) {
			try {
				await handleAfkMessages(msg, sock);
			} catch (err) {
				console.error("Error in AFK module:", err);
			}
		}

		if (msg.key.fromMe) {
			const messageContent =
				msg.message.conversation ||
				msg.message.extendedTextMessage?.text ||
				msg.message.imageMessage?.caption ||
				msg.message.videoMessage?.caption ||
				"";

			const args = messageContent.trim().split(/\s+/);
			const command = args.shift().toLowerCase();

			if (commands.has(command)) {
				try {
					await commands.get(command).execute(msg, args, sock);
				} catch (err) {
					console.error(`Error executing ${command}:`, err);
				}
			}
		}
	});

	sock.ev.on("contacts.upsert", async (contacts) => {
		for (const contact of contacts) {
			await contactsCollection.updateOne(
				{ id: contact.id },
				{ $set: contact },
				{ upsert: true },
			);
		}
	});

	sock.ev.on("messaging-history.set", async ({ chats, contacts, messages }) => {
		for (const chat of chats) {
			await chatsCollection.updateOne(
				{ id: chat.id },
				{ $set: chat },
				{ upsert: true },
			);
		}

		for (const contact of contacts) {
			await contactsCollection.updateOne(
				{ id: contact.id },
				{ $set: contact },
				{ upsert: true },
			);
		}

		for (const message of messages) {
			await messagesCollection.updateOne(
				{ "key.id": message.key },
				{ $set: message },
				{ upsert: true },
			);
		}
		console.log("Full sync done !");
	});

	sock.ev.on("messages.update", async (updates) => {
		for (const update of updates) {
			if (!update.key?.id) continue;
			await messagesCollection.updateOne(
				{ "key.id": update.key.id },
				{ $set: update },
				{ upsert: true },
			);
		}
	});

	sock.ev.on("messages.delete", async ({ keys }) => {
		for (const key of keys) {
			await messagesCollection.deleteOne({ "key.id": key.id });
		}
	});

	sock.ev.on("contacts.update", async (updates) => {
		for (const update of updates) {
			await contactsCollection.updateOne(
				{ id: update.id },
				{ $set: update },
				{ upsert: true },
			);
		}
	});

	sock.ev.on("chats.update", async (updates) => {
		for (const update of updates) {
			if (!update.id) continue;
			await chatsCollection.updateOne(
				{ id: update.id },
				{ $set: update },
				{ upsert: true },
			);
		}
	});
}

(async () => {
	try {
		await startBot();

		server.listen(process.env.PORT || 8000, () => {
			console.log(`Server listening on port ${process.env.PORT || 8000}`);
			startSelfPing();
		});
	} catch (err) {
		console.error("Failed to start bot or server:", err);
		process.exit(1);
	}
})();

export { db };
