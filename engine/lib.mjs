// Shared helpers: errors, .env loading, project resolution, Chrome detection, tool checks.
import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const ENGINE = path.dirname(fileURLToPath(import.meta.url))
export const ROOT = path.dirname(ENGINE)

/** An error meant for humans: printed without a stack trace, with an optional hint. */
export class UserError extends Error {
  constructor(message, hint) { super(message); this.hint = hint }
}

export const ASPECTS = {
  v: { w: 1080, h: 1920, tag: '9x16', label: 'vertical (TikTok, Reels, Shorts, Stories)' },
  s: { w: 1080, h: 1080, tag: '1x1', label: 'square (feeds)' },
  h: { w: 1920, h: 1080, tag: '16x9', label: 'landscape (YouTube, Google Ads)' },
  f: { w: 1080, h: 1350, tag: '4x5', label: 'portrait feed (Facebook, Instagram)' },
}
const ASPECT_ALIASES = { '9x16': 'v', '9:16': 'v', '1x1': 's', '1:1': 's', '16x9': 'h', '16:9': 'h', '4x5': 'f', '4:5': 'f' }

/** "9x16,1x1" | ["v","s"] | "all" → ["v","s"] */
export function parseAspects(value) {
  if (!value) return null
  const list = Array.isArray(value) ? value : String(value).split(/[,\s]+/).filter(Boolean)
  if (list.length === 1 && list[0] === 'all') return Object.keys(ASPECTS)
  return list.map(a => {
    const k = ASPECTS[a] ? a : ASPECT_ALIASES[a]
    if (!k) throw new UserError(`Unknown aspect ratio "${a}".`, 'Use 9x16, 1x1, 16x9, 4x5 (or v, s, h, f, or "all").')
    return k
  })
}

/** Minimal .env reader (KEY=VALUE, # comments, optional quotes). Never overrides real env vars. */
export function loadEnv(...dirs) {
  for (const dir of dirs) {
    const file = path.join(dir, '.env')
    if (!fs.existsSync(file)) continue
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/)
      if (!m || process.env[m[1]] !== undefined) continue
      let v = m[2].trim()
      if (/^(['"]).*\1$/.test(v)) v = v.slice(1, -1)
      else v = v.replace(/\s+#.*$/, '')
      if (v !== '') process.env[m[1]] = v
    }
  }
}

/** The video project is the nearest folder (from the script upwards) that holds ads.json. */
export function findProject(scriptFile, explicit) {
  if (explicit) {
    const dir = path.resolve(explicit)
    if (!fs.existsSync(path.join(dir, 'ads.json'))) throw new UserError(`No ads.json in --project ${dir}.`, 'Create one with `promo-video new <dir>` or copy examples/starter/ads.json.')
    return dir
  }
  let dir = path.dirname(path.resolve(scriptFile))
  for (;;) {
    if (fs.existsSync(path.join(dir, 'ads.json'))) return dir
    const up = path.dirname(dir)
    if (up === dir) break
    dir = up
  }
  if (fs.existsSync(path.join(process.cwd(), 'ads.json'))) return process.cwd()
  throw new UserError(`Could not find ads.json above ${scriptFile}.`,
    'Run inside a video project (a folder with ads.json, scripts/, screens/), pass --project <dir>, or start one with `promo-video new my-video`.')
}

export function readJson(file, what) {
  if (!fs.existsSync(file)) throw new UserError(`${what} not found: ${file}`)
  const text = fs.readFileSync(file, 'utf8')
  try { return JSON.parse(text) } catch (e) {
    const m = e.message.match(/line (\d+)/) || e.message.match(/position (\d+)/)
    const line = !m ? null : /line/.test(m[0]) ? Number(m[1]) : text.slice(0, Number(m[1])).split('\n').length
    const msg = e.message.replace(/\s+/g, ' ').replace(/ \(line \d+ column \d+\)/, '')
    throw new UserError(`${what} is not valid JSON${line ? ` (around line ${line})` : ''}: ${msg}`, `File: ${file}\nTip: a trailing comma or a missing comma between scenes is the usual cause.`)
  }
}

const CHROME_CANDIDATES = {
  darwin: [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  ],
  linux: ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge', 'brave-browser'],
  win32: [
    `${process.env['PROGRAMFILES'] || 'C:\\Program Files'}\\Google\\Chrome\\Application\\chrome.exe`,
    `${process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)'}\\Google\\Chrome\\Application\\chrome.exe`,
    `${process.env.LOCALAPPDATA || ''}\\Google\\Chrome\\Application\\chrome.exe`,
    `${process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)'}\\Microsoft\\Edge\\Application\\msedge.exe`,
  ],
}

function onPath(cmd) {
  const r = spawnSync(process.platform === 'win32' ? 'where' : 'which', [cmd], { encoding: 'utf8' })
  return r.status === 0 ? r.stdout.split(/\r?\n/)[0].trim() : null
}

/** --chrome flag > CHROME_PATH > PUPPETEER_EXECUTABLE_PATH > well-known install paths. */
export function findChrome(flag) {
  const explicit = flag || process.env.CHROME_PATH || process.env.PUPPETEER_EXECUTABLE_PATH
  if (explicit) {
    if (fs.existsSync(explicit)) return explicit
    const found = onPath(explicit)
    if (found) return found
    throw new UserError(`Chrome not found at "${explicit}".`, 'Fix --chrome / CHROME_PATH, or unset it to auto-detect.')
  }
  for (const c of CHROME_CANDIDATES[process.platform] || CHROME_CANDIDATES.linux) {
    if (path.isAbsolute(c) ? fs.existsSync(c) : onPath(c)) return path.isAbsolute(c) ? c : onPath(c)
  }
  throw new UserError('Could not find Google Chrome, Chromium or Edge.',
    'Install Chrome, or set CHROME_PATH=/path/to/chrome (or pass --chrome). A headless build works too:\n' +
    '  npx @puppeteer/browsers install chrome-headless-shell@stable\n  then CHROME_PATH=<printed path>')
}

export function hasTool(cmd, args = ['-version']) {
  const r = spawnSync(cmd, args, { encoding: 'utf8' })
  return r.status === 0 ? (r.stdout || r.stderr).split('\n')[0].trim() : null
}

export function requireTools(...names) {
  const install = {
    ffmpeg: 'macOS: brew install ffmpeg · Ubuntu: sudo apt install ffmpeg · Windows: winget install ffmpeg',
    ffprobe: 'ffprobe ships with ffmpeg.',
    python3: 'Install Python 3 (stdlib only, no packages needed). On Windows set PYTHON=python if needed.',
  }
  for (const n of names) {
    const cmd = n === 'python3' ? python() : n
    if (!hasTool(cmd, n === 'python3' ? ['--version'] : ['-version'])) throw new UserError(`"${cmd}" is not installed or not on PATH.`, install[n])
  }
}

export const python = () => process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3')

export function duration(file) {
  return Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).toString().trim())
}

/** Run ffmpeg quietly; on failure show its stderr tail instead of a bare exit code. */
export function ffmpeg(args, what = 'ffmpeg') {
  const r = spawnSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...args], { encoding: 'utf8', maxBuffer: 64 << 20 })
  if (r.status !== 0) throw new UserError(`${what} failed (ffmpeg exit ${r.status}).`, (r.stderr || '').trim().split('\n').slice(-6).join('\n'))
}

export const rel = p => {
  const r = path.relative(process.cwd(), p)
  return r && !r.startsWith('..') ? r : p
}

export const tmpDir = prefix => fs.mkdtempSync(path.join(os.tmpdir(), prefix))
