// Regenerate the starter template's placeholder screenshots from tools/mock-screens.html:
//   npm run mocks   →  examples/starter/screens/{today,scan,reminders,care,streak}.png (English)
//                      examples/starter/screens/vi-*.png (Vietnamese versions, picked up by lang "vi")
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { findChrome } from '../engine/lib.mjs'

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const puppeteer = createRequire(path.join(ROOT, 'package.json'))('puppeteer-core')
const out = path.join(ROOT, 'examples', 'starter', 'screens')
const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: ['--allow-file-access-from-files'] })
const page = await browser.newPage()
await page.setViewport({ width: 1080, height: 2400, deviceScaleFactor: 1 })
for (const lang of ['en', 'vi']) for (const screen of ['today', 'scan', 'reminders', 'care', 'streak']) {
  await page.goto(`${pathToFileURL(path.join(ROOT, 'tools', 'mock-screens.html')).href}?screen=${screen}&lang=${lang}`, { waitUntil: 'load' })
  await page.evaluate(() => document.fonts.ready)
  const file = path.join(out, `${lang === 'en' ? '' : lang + '-'}${screen}.png`)
  await page.screenshot({ path: file })
  console.log(path.relative(ROOT, file))
}
await browser.close()
