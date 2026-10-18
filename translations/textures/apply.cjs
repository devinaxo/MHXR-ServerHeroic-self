// Apply the texture translations in this folder to a set of resource packs.
//
//   node apply.cjs <pack-dir> [--out <dir>] [--dry-run]
//
// <pack-dir> is the folder holding the .fpk files (e.g. the cmn/ folder with
// GUI.00.fpk). Nothing is modified there: rebuilt packs are written to --out
// (default build/mhxr-translate-out) and you copy them into place yourself.
//
// This does NOT need a decoded dump. The pristine texture header for each edit
// is read straight out of the target pack, so the same patch applies to any
// server's packs regardless of their res_ver, as long as the texture names are
// the same.
//
// Requires the repo's tools-js/ (sibling of translations/), plus:
//   python3 with Pillow and texture2ddecoder
//   PVRTexToolCLI on PATH or in $PVRTEXTOOL   (only for the PVRTC4 textures)
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { Blowfish } = require('egoroof-blowfish');

const HERE = __dirname;
const TOOLS = path.resolve(HERE, '..', '..', 'tools-js');
const ARC_KEY = 'kaseoa nkaeka;eawf3';

const argv = process.argv.slice(2);
const arg = (n, d) => {
  const h = argv.find((a) => a.startsWith(`--${n}=`));
  if (h) return h.split('=').slice(1).join('=');
  const i = argv.indexOf(`--${n}`);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : d;
};
const PACK_DIR = argv.find((a) => !a.startsWith('-'));
const OUT = arg('out', path.join(process.cwd(), 'build', 'mhxr-translate-out'));
const MANIFEST_PATH = arg('manifest', path.join(HERE, 'manifest.json'));
const PNG_DIR = arg('png-dir', path.join(HERE, 'png'));
const DRY = argv.includes('--dry-run');

if (!PACK_DIR) {
  console.error('uso: node apply.cjs <pack-dir> [--out <dir>] [--dry-run]');
  process.exit(1);
}
if (!fs.existsSync(path.join(TOOLS, 'arc-edit.cjs'))) {
  console.error(`cannot find the repo tools at ${TOOLS}`);
  process.exit(1);
}
const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH));
fs.mkdirSync(OUT, { recursive: true });

// --exclude=a,b  skip any texture whose PNG name contains one of these
// (case-insensitive). Used to leave the screens we know misbehave
// (town / results / nyan expedition) on the original Japanese.
const EXCLUDE = arg('exclude', '')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);
const textures = manifest.textures.filter(
  (t) => !EXCLUDE.some((e) => t.png.toLowerCase().includes(e))
);
// archives that must never be rebuilt (see manifest.excludedTargets)
const EXCLUDED_ARCS = (manifest.excludedTargets?.arcs || []).map((a) => (a.arc ? a.arc : a));
const skippedArc = [];
if (EXCLUDE.length) {
  console.log(`excluding ${manifest.textures.length - textures.length} of ${manifest.textures.length} textures:`);
  for (const t of manifest.textures) {
    if (EXCLUDE.some((e) => t.png.toLowerCase().includes(e))) console.log(`   - ${t.png}`);
  }
}

const run = (bin, args) =>
  execFileSync(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] }).toString();

// ------------------------------------------------------------------ helpers
function findPack(pack) {
  const direct = path.join(PACK_DIR, `${pack}.fpk`);
  if (fs.existsSync(direct)) return direct;
  // walk down looking for it, so a parent folder can be given
  const stack = [PACK_DIR];
  while (stack.length) {
    const d = stack.pop();
    for (const f of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, f.name);
      if (f.isDirectory()) stack.push(p);
      else if (f.name === `${pack}.fpk`) return p;
    }
  }
  return null;
}

// decode the header fields we need to sanity-check a target
function texInfo(buf) {
  if (buf.length < 0x28 || buf.subarray(0, 4).toString('latin1') !== 'TEX ') return null;
  const bf = buf.readUInt32LE(0x0c);
  return { width: bf & 0x1fff, height: (bf >> 13) & 0x1fff, format: buf[6] };
}

// ------------------------------------------------------------------- group
const jobs = [];
for (const t of textures) {
  const png = path.join(PNG_DIR, t.png);
  if (!fs.existsSync(png)) { console.error(`missing ${png}`); process.exit(1); }
  for (const tgt of t.targets) {
    // never rebuild an archive on the excludedTargets list: rebuilding it is what
    // breaks the screen that loads it (see manifest.excludedTargets)
    if (EXCLUDED_ARCS.some((a) => tgt.arc.endsWith(a))) {
      skippedArc.push(`${t.png} -> ${tgt.arc}`);
      continue;
    }
    jobs.push({ png, tex: t, tgt });
  }
}
const packs = [...new Set(jobs.map((j) => j.tgt.pack))];

console.log(`textures: ${manifest.textures.length}   archive targets: ${jobs.length}   packs: ${packs.join(', ')}`);
if (skippedArc.length) {
  console.log(`  excludedTargets (never rebuilt): ${skippedArc.length}`);
  for (const a of skippedArc) console.log(`    - ${a}`);
}
for (const p of packs) {
  const f = findPack(p);
  if (!f) { console.error(`\n!! ${p}.fpk not found under ${PACK_DIR}`); process.exit(1); }
  console.log(`   ${p} -> ${f}`);
}
if (DRY) { console.log('\n--dry-run: nothing written'); process.exit(0); }

// ------------------------------------------------------------------- apply
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mhxr-apply-'));
let applied = 0, verified = 0;
const skipped = [];

for (const pack of packs) {
  const srcPack = findPack(pack);
  const work = path.join(tmp, pack);
  fs.mkdirSync(work, { recursive: true });
  const packCopy = path.join(work, `${pack}.fpk`);
  fs.copyFileSync(srcPack, packCopy);

  const arcs = [...new Set(jobs.filter((j) => j.tgt.pack === pack).map((j) => j.tgt.arc))];
  console.log(`\n=== ${pack}: ${arcs.length} archive(s) ===`);

  for (const arc of arcs) {
    const arcJobs = jobs.filter((j) => j.tgt.pack === pack && j.tgt.arc === arc);
    let cur = path.join(work, `${path.basename(arc).replace(/\.arc$/, '')}.arc`);
    // pull the archive out of the pack
    run('node', [path.join(TOOLS, 'fpk-pull.cjs'), 'fpk-pull', packCopy, cur, arc]);

    // extract once to grab the pristine .tex headers
    const ex = path.join(work, 'ex');
    fs.rmSync(ex, { recursive: true, force: true });
    run('node', [path.join(TOOLS, 'arc-extract.cjs'), cur, ex]);

    for (let i = 0; i < arcJobs.length; i++) {
      const j = arcJobs[i];
      const entryBase = j.tgt.entry.split('/').pop();
      const pristine = path.join(ex, j.tgt.entry);
      if (!fs.existsSync(pristine)) { skipped.push(`${entryBase}: not in ${arc}`); continue; }

      const info = texInfo(fs.readFileSync(pristine));
      if (!info) { skipped.push(`${entryBase}: not a TEX file`); continue; }
      if (info.width !== j.tex.width || info.height !== j.tex.height) {
        skipped.push(`${entryBase}: target is ${info.width}x${info.height}, patch is ${j.tex.width}x${j.tex.height}`);
        continue;
      }

      const newTex = path.join(work, `${entryBase}.tex`);
      try {
        run('python3', [path.join(TOOLS, 'tex_android.py'), 'encode', pristine, j.png, newTex]);
      } catch (e) {
        console.error(`  ENCODE FAILED ${entryBase}: ${(e.stderr || '').toString().trim().split('\n').pop()}`);
        if (j.tex.format === 'PVRTC4') {
          console.error('    (PVRTC4 needs PVRTexToolCLI: set PVRTEXTOOL=/path/to/PVRTexToolCLI)');
        }
        process.exit(1);
      }

      const next = path.join(work, `s${i}.arc`);
      const res = run('node', [
        path.join(TOOLS, 'arc-edit.cjs'), cur, next, entryBase, newTex, '--replace-entry-only',
      ]);
      if (!/entries read back with the expected bytes/.test(res)) {
        console.error(`  arc-edit FAILED for ${entryBase}\n${res}`);
        process.exit(1);
      }
      fs.renameSync(next, cur);
      applied++;
    }

    const pushed = path.join(work, `${pack}.new`);
    const res = run('node', [path.join(TOOLS, 'fpk-pull.cjs'), 'fpk-push', packCopy, pushed, path.basename(arc), cur]);
    if (!/entries byte-identical to intent/.test(res)) {
      console.error(`  fpk-push FAILED for ${arc}\n${res}`);
      process.exit(1);
    }
    fs.renameSync(pushed, packCopy);
    verified++;
    console.log(`  ok ${path.basename(arc)}`);
  }

  // normalise alignment and prove the result before handing it over
  const final = path.join(OUT, `${pack}.fpk`);
  const align = run('node', [path.join(TOOLS, 'fpk-align.cjs'), packCopy, final]);
  const clean = /CLEAN/.test(align);
  console.log(`  -> ${final}${clean ? '  (alignment clean)' : '  !! ALIGNMENT PROBLEM'}`);
  if (!clean) { console.error(align); process.exit(1); }
}

console.log(`\napplied ${applied} texture edits, rebuilt ${verified} archives`);
if (skipped.length) {
  console.log('skipped:');
  for (const s of skipped) console.log(`  ${s}`);
  console.log('(skipped entries usually mean the target pack uses a different texture version)');
}
console.log(`\npacks written to ${OUT}`);
console.log('copy each <pack>.fpk over the one your server serves, delete download.list,');
console.log('bump the resource version constant, then rebuild and restart.');
