// Personal static deploy (vercel.json): turn frontend/dist into Vercel's Build Output API layout,
// so Vercel serves the files as they are and does not turn api/ into serverless functions.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dist = path.join(root, 'frontend', 'dist')
const out = path.join(root, '.vercel', 'output')
if (!fs.existsSync(path.join(dist, 'index.html'))) throw new Error('frontend/dist has no index.html; build first')

fs.rmSync(out, { recursive: true, force: true })
fs.mkdirSync(out, { recursive: true })
fs.renameSync(dist, path.join(out, 'static'))

const noCache = { 'Cache-Control': 'no-cache' }
const config = {
  version: 3,
  routes: [
    { src: '/sw\\.js', headers: noCache, continue: true },
    { src: '/(index\\.html)?', headers: noCache, continue: true },
    { src: '/manifest\\.json', headers: noCache, continue: true },
    { src: '/assets/(.*)', headers: { 'Cache-Control': 'public, max-age=31536000, immutable' }, continue: true },
    { handle: 'filesystem' },
  ],
}
fs.writeFileSync(path.join(out, 'config.json'), JSON.stringify(config, null, 2))
console.log('vercel output: static site in .vercel/output/static')
