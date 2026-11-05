#!/usr/bin/env node
// promo-video: command line entry point. Run `promo-video help` for usage.
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { ASPECTS, ROOT, UserError, findChrome, findProject, hasTool, loadEnv, parseAspects, python, readJson, rel, tmpDir, duration, ffmpeg } from './lib.mjs'

const HELP = `promo-video: code-driven promo videos from screenshots + a JSON script

Usage
  promo-video new <dir>                  start a project from the starter template
  promo-video check <script.json>        validate a script (no rendering)
  promo-video stills <script.json>       one frame per scene per aspect + contact sheets (no voice, no API)
  promo-video build <script.json>        render the videos: out/<name>-<aspect>.mp4 + <name>.vtt
  promo-video judge <file> ["question"]  ask Gemini to review a video, audio or image
  promo-video voices "<line>"            read a line in several Gemini voices and score each take
  promo-video sheet <video> [out.jpg]    6 evenly spaced frames in one strip (cheap visual check)
  promo-video doctor                     check Node, ffmpeg, Python, Chrome, API key

Build options
  --aspects 9x16,1x1,16x9,4x5 | all      default: ads.json › aspects, else 9x16,1x1,16x9
  --no-voice                             no TTS: captions timed by reading speed, music + SFX still play
  --no-music                             voice + SFX only
  --no-captions                          no burned-in captions (.vtt is still written)
  --project <dir>                        project folder (default: nearest folder above the script with ads.json)
  --chrome <path>                        Chrome/Chromium/Edge binary (or set CHROME_PATH)
  --crf <n>                              x264 quality, lower = better/larger (default 20)
  --quiet                                only print errors and the final paths

Other options
  judge:  --model <gemini model>         default gemini-flash-latest
  voices: --voices Leda,Puck,Kore,Aoede  --lang en  --project <dir> (uses its director profile)

Environment
  GEMINI_API_KEY   voice + judge (read from .env in the project or in ${rel(ROOT)})
  CHROME_PATH      browser binary when auto-detection fails

Docs: ${path.join(ROOT, 'docs')}`

function parse(argv) {
  const pos = [], o = {}
  const value = new Set(['aspects', 'project', 'chrome', 'model', 'voices', 'lang', 'crf'])
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '-h' || a === '--help') { o.help = true; continue }
    if (!a.startsWith('--')) { pos.push(a); continue }
    const [k, inline] = a.slice(2).split('=')
    const key = k.replace(/-([a-z])/g, (_, c) => c.toUpperCase())
    if (value.has(k)) {
      const v = inline ?? argv[++i]
      if (v == null) throw new UserError(`--${k} needs a value.`)
      o[key] = v
    } else if (['no-voice', 'no-music', 'no-captions', 'quiet', 'stills'].includes(k)) o[key] = true
    else throw new UserError(`Unknown option --${k}.`, 'Run `promo-video help`.')
  }
  return { pos, o }
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2)
  if (!cmd || cmd === 'help' || cmd === '-h' || cmd === '--help') return console.log(HELP)
  const { pos, o } = parse(rest)
  if (o.help) return console.log(HELP)
  const scriptArg = pos[0]
  const projectDir = (() => {
    try { return ['build', 'stills', 'check'].includes(cmd) && scriptArg ? findProject(scriptArg, o.project) : o.project ? path.resolve(o.project) : null } catch { return null }
  })()
  loadEnv(...[projectDir, process.cwd(), ROOT].filter(Boolean))

  switch (cmd) {
    case 'build':
    case 'stills': {
      if (!scriptArg) throw new UserError(`Usage: promo-video ${cmd} <script.json> [options]`)
      const { build } = await import('./build.mjs')
      const t0 = Date.now()
      await build({ script: scriptArg, stills: cmd === 'stills' || o.stills, aspects: parseAspects(o.aspects), noVoice: o.noVoice, noMusic: o.noMusic,
        noCaptions: o.noCaptions, project: o.project, chrome: o.chrome, crf: o.crf && Number(o.crf), quiet: o.quiet,
        progress: o.quiet || cmd === 'stills' ? null : (tag, i, n) => { if (i === n || i % 3 === 0) process.stdout.write(`  ${tag}: scene ${i}/${n}\n`) } })
      if (!o.quiet) console.log(`done in ${((Date.now() - t0) / 1000).toFixed(0)}s`)
      break
    }
    case 'check': {
      if (!scriptArg) throw new UserError('Usage: promo-video check <script.json>')
      const { validate } = await import('./validate.mjs')
      const project = findProject(scriptArg, o.project)
      const { errors, warnings } = validate(readJson(path.resolve(scriptArg), 'Script'), readJson(path.join(project, 'ads.json'), 'ads.json'), project)
      for (const w of warnings) console.log(`  note: ${w}`)
      if (errors.length) throw new UserError(`${errors.length} problem(s):\n  - ${errors.join('\n  - ')}`)
      console.log(`✓ ${rel(path.resolve(scriptArg))} is valid (project: ${rel(project) || '.'})`)
      break
    }
    case 'judge': {
      if (!scriptArg) throw new UserError('Usage: promo-video judge <file> ["question"] [--model gemini-flash-latest]')
      const { judge } = await import('./judge.mjs')
      console.log(await judge(scriptArg, pos[1], { model: o.model }))
      break
    }
    case 'voices': {
      if (!scriptArg) throw new UserError('Usage: promo-video voices "<a line from your script>" [--voices Leda,Puck,Kore,Aoede]')
      const { audition } = await import('./judge.mjs')
      let director = null, model = o.model, lang = o.lang || 'en'
      if (projectDir && fs.existsSync(path.join(projectDir, 'ads.json'))) {
        const c = readJson(path.join(projectDir, 'ads.json'), 'ads.json')
        const accent = c.lang?.[lang]?.accent || lang
        director = c.voice?.director && [].concat(c.voice.director).join('\n').replaceAll('{LANG}', accent)
        model = model || c.voice?.model
      }
      const out = path.join(projectDir || process.cwd(), 'out', 'voices')
      const rows = await audition(scriptArg, { voices: (o.voices || 'Leda,Puck,Kore,Aoede').split(','), model, lang, outDir: out, director })
      for (const r of rows) console.log(`${r.voice.padEnd(10)} ${r.verdict}   ${rel(r.file)}`)
      console.log(`→ set ads.json › voice.voice to "${rows[0].voice}"`)
      break
    }
    case 'sheet': {
      if (!scriptArg) throw new UserError('Usage: promo-video sheet <video> [out.jpg]')
      const out = pos[1] || scriptArg.replace(/\.[^.]+$/, '') + '-sheet.jpg'
      const d = duration(scriptArg), tmp = tmpDir('promo-sheet-')
      for (let k = 0; k < 6; k++) ffmpeg(['-ss', (d * (k + 0.5) / 6).toFixed(3), '-i', scriptArg, '-frames:v', '1', '-vf', 'scale=220:-2', path.join(tmp, `${k}.png`)], 'grabbing a frame')
      ffmpeg([...[0, 1, 2, 3, 4, 5].flatMap(k => ['-i', path.join(tmp, `${k}.png`)]), '-filter_complex', 'hstack=6', out], 'joining frames')
      fs.rmSync(tmp, { recursive: true, force: true })
      console.log(`✓ ${rel(path.resolve(out))}`)
      break
    }
    case 'new': {
      if (!scriptArg) throw new UserError('Usage: promo-video new <dir>')
      const dest = path.resolve(scriptArg)
      if (fs.existsSync(dest) && fs.readdirSync(dest).length) throw new UserError(`${dest} already exists and is not empty.`)
      const src = path.join(ROOT, 'examples', 'starter')
      fs.cpSync(src, dest, { recursive: true, filter: f => !/(^|[\\/])(out|\.cache)([\\/]|$)/.test(path.relative(src, f)) })
      // point "$schema" at this installation so editors keep validating
      for (const f of [path.join(dest, 'ads.json'), ...fs.readdirSync(path.join(dest, 'scripts')).map(n => path.join(dest, 'scripts', n))]) {
        const j = fs.readFileSync(f, 'utf8')
        fs.writeFileSync(f, j.replace(/"\$schema":\s*"[^"]*?(config|script)\.schema\.json"/, (_, kind) => {
          const target = path.join(ROOT, 'schema', `${kind}.schema.json`)
          const relPath = path.relative(path.dirname(f), target).split(path.sep).join('/')
          // nearby: a relative path; far away (another folder tree): a file:// URL editors also accept
          return `"$schema": ${JSON.stringify((relPath.match(/\.\.\//g) || []).length <= 4 ? relPath : pathToFileURL(target).href)}`
        }))
      }
      fs.copyFileSync(path.join(ROOT, '.env.example'), path.join(dest, '.env.example'))
      fs.writeFileSync(path.join(dest, '.gitignore'), 'out/\n.cache/\n.env\n*.mp4\n*.mov\n*.wav\n')
      console.log(`✓ new project at ${rel(dest)}\n  next: replace screens/*.png with your own screenshots, edit ads.json and scripts/launch-en.json, then\n  promo-video stills ${rel(path.join(dest, 'scripts', 'launch-en.json'))}`)
      break
    }
    case 'doctor': {
      const ok = (label, v, fix) => console.log(`${v ? '✓' : '✗'} ${label.padEnd(16)} ${v || fix}`)
      ok('node', process.versions.node && `v${process.versions.node}${Number(process.versions.node.split('.')[0]) < 18 ? ' (needs 18+)' : ''}`, '')
      ok('ffmpeg', hasTool('ffmpeg'), 'install ffmpeg (brew install ffmpeg / apt install ffmpeg / winget install ffmpeg)')
      ok('ffprobe', hasTool('ffprobe'), 'ships with ffmpeg')
      ok('python3', hasTool(python(), ['--version']), 'install Python 3 (stdlib only); on Windows set PYTHON=python')
      let pc = null
      try { pc = (await import('node:module')).createRequire(path.join(ROOT, 'package.json')).resolve('puppeteer-core') && 'installed' } catch {}
      ok('puppeteer-core', pc, `run npm install in ${ROOT}`)
      let chrome = null
      try { chrome = findChrome(o.chrome) } catch (e) { chrome = null; ok('chrome', null, e.hint?.split('\n')[0] || e.message) }
      if (chrome) ok('chrome', chrome, '')
      ok('GEMINI_API_KEY', process.env.GEMINI_API_KEY ? 'set' : null, 'not set: voice and judge disabled, build with --no-voice (see .env.example)')
      console.log(`aspects: ${Object.values(ASPECTS).map(a => `${a.tag} ${a.w}×${a.h}`).join(' · ')}`)
      break
    }
    default:
      throw new UserError(`Unknown command "${cmd}".`, 'Run `promo-video help`.')
  }
}

main().catch(e => {
  if (e instanceof UserError) {
    console.error(`\n✗ ${e.message}`)
    if (e.hint) console.error(`  ${e.hint.split('\n').join('\n  ')}`)
    process.exit(1)
  }
  console.error(e)
  process.exit(1)
})
