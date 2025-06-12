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

import fetch from 'node-fetch';
import dotenv from 'dotenv';

dotenv.config();

const TIME_ZONE = process.env.TIME_ZONE || 'Asia/Kolkata';
const AUTO_BIO_INTERVAL = parseInt(process.env.AUTO_BIO_INTERVAL_MS, 10) || 60000;

let lastQuote = '';

function getTimeInTimeZone(timeZone) {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
    .formatToParts(now)
    .reduce((acc, part) => {
      if (part.type !== 'literal') acc[part.type] = part.value;
      return acc;
    }, {});

  return new Date(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`);
}

async function runQuoteUpdate() {
  try {
    let quote = '';
    let attempts = 0;

    while (!quote || quote.length > 139 || quote === lastQuote) {
      const res = await fetch('https://quotes-api-self.vercel.app/quote');
      const data = await res.json();
      quote = data.quote;
      attempts++;

      if (attempts >= 10) {
        console.warn(
          'Failed to find a new quote after 10 attempts. Skipping...'
        );
        return null;
      }
    }

    lastQuote = quote;
    return quote;
  } catch (error) {
    console.error('Error fetching quote:', error.message);
    return null;
  }
}

export async function startAutoBio(sock) {
  if (globalThis.autobioRunning) return;

  globalThis.autobioRunning = true;

  const now = getTimeInTimeZone(TIME_ZONE);
  const nextMinute = new Date(now);
  nextMinute.setSeconds(0);
  nextMinute.setMilliseconds(0);
  nextMinute.setMinutes(nextMinute.getMinutes() + 1);
  const delay = nextMinute - now;

  globalThis.autobioInterval = setInterval(async () => {
    const q = await runQuoteUpdate();
    if (q) {
      try {
        await sock.updateProfileStatus(q);
        console.log('About updated');
      } catch (error) {
        console.error('About update failed:', error.message);
      }
    }
  }, AUTO_BIO_INTERVAL);

  setTimeout(async () => {
    const quote = await runQuoteUpdate();
    if (quote) {
      try {
        await sock.updateProfileStatus(quote);
        console.log('About updated');
      } catch (error) {
        console.error('About update failed:', error.message);
      }
    }
  }, delay);
}

export default {
  name: '.autobio',
  description: 'Start updating WhatsApp About with motivational quotes every X seconds',
  usage: 'Type .autobio in any chat to start updating WhatsApp "About"...',
  
  async execute(msg, _args, sock) {
    const jid = msg.key.remoteJid;

    if (globalThis.autobioRunning) {
      if (!msg.fromStartup) {
        await sock.sendMessage(jid, { text: 'AutoBio is already running!' }, { quoted: msg });
      }
      return;
    }

    if (!msg.fromStartup) {
      await sock.sendMessage(jid, { text: `AutoBio started. Updating every ${AUTO_BIO_INTERVAL / 1000}s` }, { quoted: msg });
    }

    await startAutoBio(sock);
  },
};
