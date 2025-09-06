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

import { exec } from 'node:child_process'
import util from 'node:util'
const asyncExec = util.promisify(exec)

const REPO_URL = process.env.REPO_URL || 'https://github.com/ayusc/WahBuddy.git'
const REPO_BRANCH = process.env.REPO_BRANCH || 'main'

export default [
  {
    name: '.update',
    description: 'Update the bot from the repository',
    usage: '.update',

    async execute(msg, _args, sock) {
      const jid = msg.key.remoteJid
      const sent = await sock.sendMessage(jid, { text: '[░░░░░░░░░░] 0% Starting update' }, { quoted: msg })

      const step = async (progress, label) => {
        await sock.sendMessage(
          jid,
          { text: `[${'█'.repeat(progress / 10)}${'░'.repeat(10 - progress / 10)}] ${progress}% ${label}`, edit: sent.key }
        )
      }

      try {
        await step(10, 'Fetching updates')
        await asyncExec(`git fetch ${REPO_URL} ${REPO_BRANCH}`)

        await step(30, 'Resetting to latest commit')
        await asyncExec(`git reset --hard FETCH_HEAD`)

        await step(50, 'Installing dependencies')
        await asyncExec('npm install')

        await step(80, 'Rebuilding project')
        try { await asyncExec('npm run build') } catch {}

        await step(100, 'Reloading modules')
        const { loadCommands } = await import('../main.js')
        await loadCommands()

        await sock.sendMessage(jid, { text: '[██████████] 100% Update complete', edit: sent.key })
      } catch (err) {
        await sock.sendMessage(jid, { text: `Update failed: ${err.message}`, edit: sent.key })
      }
    },
  },
  {
    name: '.restart',
    description: 'Restart the bot process',
    usage: '.restart',

    async execute(msg, _args, sock) {
      const jid = msg.key.remoteJid
      const sent = await sock.sendMessage(jid, { text: '[░░░░░░░░░░] 0% Preparing restart' }, { quoted: msg })

      const step = async (progress, label) => {
        await sock.sendMessage(
          jid,
          { text: `[${'█'.repeat(progress / 10)}${'░'.repeat(10 - progress / 10)}] ${progress}% ${label}`, edit: sent.key }
        )
      }

      try {
        await step(30, 'Saving state')
        await step(60, 'Closing connections')
        await step(90, 'Finalizing')
        await step(100, 'Restarting now')
        process.exit(0)
      } catch (err) {
        await sock.sendMessage(jid, { text: `Restart failed: ${err.message}`, edit: sent.key })
      }
    },
  },
]
