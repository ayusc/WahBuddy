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

import express from 'express';
import axios from 'axios';

const SITE_URL = process.env.SITE_URL;

const app = express();

app.get('/', (req, res) => {
  res.json({ status: 'Running' });
});

app.get('/health', (req, res) => {
  res.json({ status: 'Healthy' });
});

if (SITE_URL) {
  setInterval(async () => {
    try {
      await axios.get(`https://${SITE_URL}/health`);
    } catch (err) {
      console.error('Error in HTTP server:', err.message);
    }
  }, 60 * 1000);
}

export default app;
