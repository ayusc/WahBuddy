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

import dotenv from 'dotenv';

dotenv.config();

const TIME_ZONE = process.env.TIME_ZONE || 'Asia/Kolkata';
const AUTO_NAME_INTERVAL =
  parseInt(process.env.AUTO_NAME_INTERVAL_MS, 10) || 60000;
const NAME_PREFIX = process.env.NAME_PREFIX || 'root@wahbuddy[{autoname}]:~$';

function getCurrentTimeInZone() {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-IN', {
    timeZone: TIME_ZONE,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  return formatter.format(now);
}

export async function startAutoName(sock) {
  globalThis.autonameRunning = true;

  const updateName = async () => {

    if (globalThis.connectionState!== 'open') {
      console.warn('AutoName: Connection not open. Skipping update.');
      return;
    }

    const time = getCurrentTimeInZone();
    const name = NAME_PREFIX.replace('{autoname}', time);

    try {
      await globalThis.profileLimiter.schedule(() => sock.updateProfileName(name));
      console.log('Name updated');
    } catch (err) {
      console.error('Failed to update name:', err);
    }
  };

  const runRecursiveLoop = async () => {
    try {
      await updateName(); 
    } catch (err) {
      console.error("Error in autoname loop:", err);
    } finally {
      const nextRunDelay = AUTO_NAME_INTERVAL - (Date.now() % AUTO_NAME_INTERVAL);
      globalThis.autonameInterval = setTimeout(runRecursiveLoop, nextRunDelay);
    }
  };

  const now = Date.now();
  const delayToNextMinute = AUTO_NAME_INTERVAL - (now % AUTO_NAME_INTERVAL);
  globalThis.autonameInterval = setTimeout(runRecursiveLoop, delayToNextMinute);
}

export default [
  {
    name: '.autoname',
    description: 'Start updating WhatsApp name with a running clock',
    usage: 'Type .autoname to start showing a live clock in your profile name.',

    async execute(msg, _args, sock) {
      const jid = msg.key.remoteJid;

      if (globalThis.autonameRunning) {
        if (!msg.fromStartup) {
          await sock.sendMessage(
            jid,
            { text: 'AutoName is already running!' },
            { quoted: msg }
          );
        }
        return;
      }

      if (!msg.fromStartup) {
        await sock.sendMessage(
          jid,
          {
            text: `AutoName started. Updating every ${AUTO_NAME_INTERVAL / 1000}s`,
          },
          { quoted: msg }
        );
      }
      await startAutoName(sock);
    },
  },
  {
    name: '.stopname',
    description: 'Stop updating WhatsApp name with clock.',
    usage: 'Type .stopname to stop showing clock in profile name.',

    async execute(msg, _args, sock) {
      if (globalThis.autonameInterval) {
        clearInterval(globalThis.autonameInterval);
        globalThis.autonameInterval = null;
        globalThis.autonameRunning = false;

        await sock.sendMessage(
          msg.key.remoteJid,
          {
            text: 'AutoName stopped',
          },
          { quoted: msg }
        );
      } else {
        await sock.sendMessage(
          msg.key.remoteJid,
          {
            text: 'AutoName is not running',
          },
          { quoted: msg }
        );
      }
    },
  },
];
