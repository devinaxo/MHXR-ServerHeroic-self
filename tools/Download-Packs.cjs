#!/usr/bin/env node
/*
 * Downloads the resource packs (FPK) from the private server, verifies them and
 * lays them out where the server expects to find them.
 *
 * Node port of tools/Download-Packs.ps1. The manifest CRC is "crcjam":
 * table-driven CRC-32 (poly 0xEDB88320, init 0xFFFFFFFF) WITHOUT the final XOR,
 * same as crc/crcjam in src/services/initResourceDownloadList.ts.
 *
 * Uses the FULL manifest (v0285/stdDL/download.list). The differential
 * (d0282_0285 and friends) describe packs larger than the ones the origin
 * actually serves, which reads as false corruption.
 *
 * ".cjs" because package.json declares "type": "module": a .js under /app would
 * be parsed as ESM and every require() would fail.
 *
 * Usage:
 *   node tools/Download-Packs.cjs
 *   node tools/Download-Packs.cjs -Sets Std
 *   node tools/Download-Packs.cjs -Only cmn/GUI
 *   node tools/Download-Packs.cjs -CrcPolicy size-only
 *
 * Capcom's files, under Capcom's licence. Personal use only.
 */
'use strict'

const fs = require('fs')
const path = require('path')
const http = require('http')

const TAB = (() => {
  const t = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i >>> 0
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[i] = c >>> 0
  }
  return t
})()

// crcJam: same table and init as pycrc, but the register is returned as-is. The
// final XOR would yield the complement, i.e. every pack reported as corrupt.
// crcJam("123456789") = 340bc6d9 (zlib: cbf43926), crcJam("") = ffffffff.
function crcJamContinue(crc, buf) {
  for (let i = 0; i < buf.length; i++) {
    crc = TAB[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8)
  }
  return crc >>> 0
}

function crcJamOf(buf) {
  return crcJamContinue(0xffffffff, buf)
}

// Streamed: the largest pack is 142 MB and does not fit comfortably in memory.
function crcJamFile(file) {
  return new Promise((resolve, reject) => {
    let crc = 0xffffffff
    const rs = fs.createReadStream(file, { highWaterMark: 4 * 1024 * 1024 })
    rs.on('data', (c) => {
      crc = crcJamContinue(crc, c)
    })
    rs.on('error', reject)
    rs.on('end', () => resolve(crc >>> 0))
  })
}

function parseArgs(argv) {
  const out = {
    server: 'http://57.131.193.244/',
    projectRoot: path.resolve(__dirname, '..'),
    sets: ['Std', 'Opening', 'Tutorial', 'Training'],
    only: '',
    delay: 0,
    concurrency: 3,
    force: false,
    verifyOnly: false,
    crcPolicy: 'strict', // 'strict' | 'size-only'
  }
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    const next = () => argv[++i]
    switch (a) {
      case '-Server':
      case '--server':
        out.server = next()
        break
      case '-ProjectRoot':
      case '--project-root':
        out.projectRoot = path.resolve(next())
        break
      case '-Sets':
      case '--sets':
        out.sets = next()
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
        break
      case '-Only':
      case '--only':
        out.only = next()
        break
      case '-Delay':
      case '--delay':
        out.delay = Number(next())
        break
      case '-Concurrency':
      case '--concurrency':
        out.concurrency = Math.max(1, Number(next()))
        break
      case '-Force':
      case '--force':
        out.force = true
        break
      case '-CrcPolicy':
      case '--crc-policy':
        out.crcPolicy = next()
        if (!['strict', 'size-only'].includes(out.crcPolicy)) {
          throw new Error(`-CrcPolicy must be 'strict' or 'size-only', got ${out.crcPolicy}`)
        }
        break
      case '-VerifyOnly':
      case '--verify-only':
        out.verifyOnly = true
        break
      case '-h':
      case '--help':
        console.log(require('fs').readFileSync(__filename, 'utf8').split('*/')[0])
        process.exit(0)
        break
      default:
        throw new Error(`unknown argument: ${a}`)
    }
  }
  return out
}

const USER_AGENT = 'MHXR-ServerHeroic-self/1.0 (self-host pack fetcher)'

function get(url, timeoutMs) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { headers: { 'user-agent': USER_AGENT } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume()
        resolve(get(new URL(res.headers.location, url).toString(), timeoutMs))
        return
      }
      if (res.statusCode !== 200) {
        res.resume()
        reject(new Error(`HTTP ${res.statusCode} for ${url}`))
        return
      }
      resolve(res)
    })
    req.setTimeout(timeoutMs, () => req.destroy(new Error(`timeout after ${timeoutMs}ms`)))
    req.on('error', reject)
  })
}

async function getText(url) {
  const res = await get(url, 120000)
  const chunks = []
  for await (const c of res) chunks.push(c)
  return Buffer.concat(chunks).toString('utf8')
}

// One line per pack: path,crcjam,size. The path carries its own group name as
// the first segment (/stdDL/cmn/GUI.00.fpk); strip it before appending to the
// group's base URL, or the group appears twice and the request 404s.
async function getManifest(base, listPath) {
  const raw = await getText(`${base}/${listPath}`)
  const out = []
  for (const line of raw.split('\n')) {
    const t = line.trim()
    if (!t) continue
    const p = t.split(',')
    if (p.length < 3) continue
    out.push({
      path: p[0],
      crc: Number.parseInt(p[1].trim(), 16) >>> 0,
      size: Number.parseInt(p[2].trim(), 10),
    })
  }
  return out
}

async function getPack(item, opts) {
  const { destRoot, urlBase, prefix, force, delay, verifyOnly, crcPolicy } = opts
  const rel = item.path.replace(new RegExp(`^/?${prefix}/`), '').replace(/^\/+/, '')
  const dest = path.join(destRoot, rel)
  const mb = (item.size / 1048576).toFixed(1)

  // Already present and intact: skip, so the script can be re-run safely.
  if (fs.existsSync(dest)) {
    const len = fs.statSync(dest).size
    if (!force && len === item.size) {
      if ((await crcJamFile(dest)) === item.crc) {
        console.log(`  already ok  ${rel.padEnd(42)} ${mb.padStart(7)} MB`)
        return 'ok'
      }
      // Right size, wrong CRC. Under 'size-only' that is a good file whose
      // manifest entry is stale -- do not re-download it on every run.
      if (crcPolicy === 'size-only') {
        console.log(`  already ok  ${rel.padEnd(42)} ${mb.padStart(7)} MB (size ok, CRC differs)`)
        return 'ok'
      }
      console.log(`  re-fetching (crc differs) ${rel}`)
    } else if (!force) {
      console.log(`  re-fetching (size differs) ${rel}`)
    }
  }

  if (verifyOnly) {
    console.log(`  MISSING     ${rel.padEnd(42)} ${mb.padStart(7)} MB`)
    return 'error'
  }

  await fs.promises.mkdir(path.dirname(dest), { recursive: true })

  // Download to .part: the file only becomes a .fpk once size and CRC check out,
  // so a partial transfer cannot be mistaken for a good file on the next run.
  const part = `${dest}.part`
  const url = `${urlBase}/${rel}`

  let lastErr = null
  for (let attempt = 1; attempt <= 3; attempt++) {
    let written = 0
    let crc = 0xffffffff
    try {
      const res = await get(url, 600000)
      const ws = fs.createWriteStream(part)
      try {
        for await (const chunk of res) {
          written += chunk.length
          crc = crcJamContinue(crc, chunk)
          if (!ws.write(chunk)) {
            await new Promise((r) => ws.once('drain', r))
          }
        }
      } finally {
        await new Promise((resolve, reject) => ws.end((e) => (e ? reject(e) : resolve())))
      }

      if (written !== item.size) {
        throw new Error(`size differs: expected ${item.size} bytes, got ${written}`)
      }

      const hex = (n) => n.toString(16).padStart(8, '0')
      let acceptedOnCrc = false
      if ((crc >>> 0) !== item.crc) {
        if (opts.crcPolicy === 'size-only') {
          acceptedOnCrc = true
          console.log(
            `  size ok, CRC differs (accepted)  ${rel.padEnd(30)} ` +
              `manifest=${hex(item.crc)} actual=${hex(crc >>> 0)}`
          )
        } else {
          throw new Error(
            `CRC differs: expected ${hex(item.crc)}, got ${hex(crc >>> 0)}`
          )
        }
      }

      await fs.promises.rename(part, dest)
      if (!acceptedOnCrc) {
        console.log(`  downloaded  ${rel.padEnd(42)} ${mb.padStart(7)} MB`)
      }
      if (delay > 0) await new Promise((r) => setTimeout(r, delay * 1000))
      return 'ok'
    } catch (e) {
      lastErr = e
      await fs.promises.rm(part, { force: true })
      if (attempt === 3) {
        console.log(`  FAILED      ${rel.padEnd(42)} ${e.message}`)
        return 'error'
      }
      console.log(`  retry ${attempt}/3 on ${rel}: ${e.message}`)
      await new Promise((r) => setTimeout(r, 5000))
    }
  }

  console.log(`  FAILED      ${rel.padEnd(42)} ${lastErr && lastErr.message}`)
  return 'error'
}

// For stdDL the manifest and the file base differ on purpose: the manifest that
// matches the served bytes is the full one, not the differential.
const GROUPS = {
  Std: { list: 'v0285/stdDL/download.list', file: 'v0285/stdDL', root: 'v0282/stdDL' },
  Opening: { list: 'openingDL/download.list', file: 'openingDL', root: 'openingDL' },
  Tutorial: { list: 'tutorialDL/download.list', file: 'tutorialDL', root: 'tutorialDL' },
  Training: { list: 'trainingDL/download.list', file: 'trainingDL', root: 'trainingDL' },
}

// -CrcPolicy:
//   strict    (default) a CRC mismatch fails the pack
//   size-only accept a size-correct pack whose CRC disagrees, using the CRC
//             actually computed. Safe for self-hosting: the server regenerates
//             download.list from YOUR files, so the manifest it serves describes
//             these exact bytes.
// Needed because every tutorialDL and trainingDL manifest on the origin
// advertises a CRC that disagrees with the bytes served, while the size matches
// exactly on all 26 files. Two of them are byte-identical to their stdDL
// counterparts and carry the CRC the STD manifest gives them, so the bytes are
// good and those manifests are the stale artifact.
async function pool(items, limit, worker) {
  const results = new Array(items.length)
  let next = 0
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = next++
      if (i >= items.length) return
      results[i] = await worker(items[i])
    }
  })
  await Promise.all(runners)
  return results
}

async function main() {
  const args = parseArgs(process.argv)
  const server = args.server.replace(/\/+$/, '')

  if (!fs.existsSync(args.projectRoot)) throw new Error(`project directory not found: ${args.projectRoot}`)
  const resRoot = path.join(args.projectRoot, 'src/public/res/download/android')

  console.log('')
  console.log(`\x1b[36mDownloading packs from ${server}\x1b[0m`)
  console.log(`\x1b[90minto: ${resRoot}\x1b[0m`)
  console.log('')

  const summary = {}

  for (const set of args.sets) {
    const g = GROUPS[set]
    if (!g) throw new Error(`unknown set: ${set} (expected ${Object.keys(GROUPS).join(', ')})`)

    const base = `${server}/res/download/android`
    const urlBase = `${base}/${g.file}`
    const destRoot = path.join(resRoot, g.root)
    // Last folder of the destination is the prefix to strip: v0282/stdDL -> stdDL.
    const prefix = path.basename(g.root)

    console.log(`\x1b[36m--- ${set} ---\x1b[0m`)
    let items = await getManifest(base, g.list)
    if (items.length === 0) {
      console.log('\x1b[33m  manifest empty, no packs\x1b[0m')
      continue
    }
    if (args.only) items = items.filter((it) => it.path.includes(args.only))

    const total = items.reduce((a, b) => a + b.size, 0)
    console.log(`\x1b[90m  ${items.length} packs, ${(total / 1073741824).toFixed(2)} GB\x1b[0m`)
    console.log('')

    await fs.promises.mkdir(destRoot, { recursive: true })

    const results = await pool(items, args.concurrency, (it) =>
      getPack(it, {
        destRoot,
        urlBase,
        prefix,
        force: args.force,
        delay: args.delay,
        verifyOnly: args.verifyOnly,
        crcPolicy: args.crcPolicy,
      })
    )
    const ok = results.filter((r) => r === 'ok').length
    const ko = results.length - ok
    summary[set] = { ok, ko, tot: results.length }
    console.log('')
  }

  // download.list is never copied from the internet: it must describe the files
  // actually in YOUR tree. The server regenerates a missing one on boot
  // (initResourceDownloadList.ts), so deleting is enough -- a leftover manifest
  // is left alone and would describe someone else's files.
  const walk = (dir, fn) => {
    let ents = []
    try {
      ents = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of ents) {
      const full = path.join(dir, e.name)
      if (e.isDirectory()) walk(full, fn)
      else fn(full)
    }
  }
  walk(resRoot, (f) => {
    if (path.basename(f) === 'download.list') {
      console.log(
        `\x1b[90mremoving ${f.slice(args.projectRoot.length)} (the server will regenerate it)\x1b[0m`
      )
      fs.unlinkSync(f)
    }
  })

  console.log('')
  console.log('\x1b[36m================ summary ================\x1b[0m')
  let totOk = 0
  let totKo = 0
  for (const [k, r] of Object.entries(summary)) {
    totOk += r.ok
    totKo += r.ko
    const col = r.ko > 0 ? '\x1b[33m' : '\x1b[32m'
    console.log(
      `${col}  ${k.padEnd(9)} ${String(r.ok).padStart(4)} ok  ${String(r.ko).padStart(3)} failed  (of ${r.tot})\x1b[0m`
    )
  }
  console.log(`\x1b[36m  ${'TOTAL'.padEnd(9)} ${String(totOk).padStart(4)} ok  ${String(totKo).padStart(3)} failed\x1b[0m`)

  let count = 0
  let bytes = 0
  walk(resRoot, (f) => {
    if (f.endsWith('.fpk')) {
      count++
      bytes += fs.statSync(f).size
    }
  })
  console.log(`\x1b[32mPacks on disk: ${count}, ${(bytes / 1073741824).toFixed(2)} GB\x1b[0m`)

  if (totKo > 0) {
    console.log('')
    console.log(
    `\x1b[33mWarning: ${totKo} packs are not in order. Re-run the same command; it only fetches what is missing.\x1b[0m`
  )
  }

  console.log('')
  console.log('\x1b[36mNext steps:\x1b[0m')
  console.log('  1. cp .env.example .env and set IP=<your hostname>, not 0.0.0.0')
  console.log('  2. docker compose -f docker-compose.prod.yml up -d --build')
  console.log('  3. on first boot the server regenerates the download.list files and logs')
  console.log('     "File created successfully"')

  process.exit(totKo > 0 ? 1 : 0)
}

main().catch((e) => {
  console.error(`\x1b[31m${e.stack || e.message}\x1b[0m`)
  process.exit(1)
})
