// Pack a folder of translated PNGs back into the resource packs and deploy.
//
//   node tools-js/tex-ship.cjs dump/restore-now [--pack-dir <dir>] [--out <dir>]
//
// For every PNG it finds, the filename is matched against dump/manifest.json to
// find which .arc entry it replaces (flat staged names like
// GUI.00_GUI_cmn_cmn_equipbanner_LP4_NOMIP_jpn, or the bare texture name).
// Each PNG is re-encoded against its pristine .tex header, every texture in the
// same arc is applied in sequence, then each touched arc goes back into its pack
// and the pack is written out.
//
// Packs already deployed are used as the starting point, so shipping a second
// batch keeps the first batch's edits.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const HERE = __dirname;
const argv = process.argv.slice(2);
const arg = (name, dflt) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  if (hit) return hit.split('=').slice(1).join('=');
  const i = argv.indexOf(`--${name}`);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : dflt;
};

const PACK_DIR = arg('pack-dir', 'src/public/res/download/android/v0286/stdDL/cmn');
const OUT = arg('out', '/tmp/opencode/ship');
const PY = arg('py', 'python3');
const DRY = argv.includes('--dry-run');

// The folder to ship is required and must be unambiguous: a positional argument
// or --src. No default folder -- a silently-wrong one ships the previous batch.
const POSITIONAL = argv.find((a) => !a.startsWith('-'));
const SRC = arg('src', POSITIONAL);
if (!SRC) {
  console.error('uso: node tex-ship.cjs <folder> [--out <dir>] [--dry-run]');
  process.exit(1);
}
if (!fs.existsSync(SRC)) {
  console.error(`${SRC} not found`);
  process.exit(1);
}
fs.mkdirSync(OUT, { recursive: true });

// The PNGs and the manifest must be in the same folder; a nested subfolder of a
// staged dump (e.g. dump/urgent/done) has no manifest of its own, so fail loudly
// rather than silently picking up the whole dump.
// The manifest usually sits beside the PNGs, but a "done" subfolder inside a
// staged dump (dump/urgent/done) has none of its own, so walk up to the nearest
// one and say which file was used.
function findManifest(start) {
  let dir = path.resolve(start);
  while (true) {
    const cand = path.join(dir, 'manifest.json');
    if (fs.existsSync(cand)) return { file: cand, dir };
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}
const foundManifest = findManifest(SRC);
const MANIFEST_OPT = arg('manifest');
if (!foundManifest && !MANIFEST_OPT) {
  console.error(`no manifest.json at or above ${SRC} (use --manifest <file>)`);
  process.exit(1);
}
const manifestPath = MANIFEST_OPT ? path.resolve(MANIFEST_OPT) : foundManifest.file;
if (!fs.existsSync(manifestPath)) {
  console.error(`manifest not found: ${manifestPath}`);
  process.exit(1);
}
if (!MANIFEST_OPT && foundManifest && path.resolve(foundManifest.dir) !== path.resolve(SRC)) {
  console.log(`manifest: ${manifestPath} (found above ${SRC})`);
}
const records = JSON.parse(fs.readFileSync(manifestPath));

// A texture commonly appears in SEVERAL archives (menu_hunterinfo is in five),
// and the client may load any of them, so every copy has to be patched or the
// translation is invisible. Build name -> [all rows], duplicates included.
const byName = new Map();
for (const r of records) {
  const base = r.entry.split('/').pop();
  const arcStem = path.basename(r.arc).replace(/\.arc$/i, '');
  for (const key of [`${r.pack}_${arcStem}_${base}`, base]) {
    if (!byName.has(key)) byName.set(key, []);
    // prefer the canonical (non-duplicate) row first: its tex_path is the one
    // that actually exists on disk
    const list = byName.get(key);
    if (r.status === 'duplicate') list.push(r);
    else list.unshift(r);
  }
}

// ---------------------------------------------------------------- collect
const pngs = fs.readdirSync(SRC).filter((f) => f.toLowerCase().endsWith('.png')).sort();
if (!pngs.length) {
  console.error(`no PNGs in ${SRC}`);
  process.exit(1);
}

const jobs = [];
const skipped = [];
for (const f of pngs) {
  const stem = f.replace(/\.png$/i, '');
  const rows = byName.get(stem);
  if (!rows || !rows.length) {
    skipped.push(`${f}: no manifest match`);
    continue;
  }
  // every copy of this texture, one job per archive
  const canonical = rows.find((r) => r.status !== 'duplicate') || rows[0];
  const tex = path.resolve(canonical.tex_path);
  if (!fs.existsSync(tex)) {
    skipped.push(`${f}: pristine .tex missing (${tex})`);
    continue;
  }
  for (const row of rows) {
    jobs.push({ png: path.join(SRC, f), tex, row, stem });
  }
}

console.log(`PNGs in ${SRC}: ${pngs.length}`);
console.log(`matched: ${jobs.length}   skipped: ${skipped.length}`);
for (const s of skipped) console.log(`  skip ${s}`);
if (!jobs.length) process.exit(1);

// group by arc
const byArc = new Map();
for (const j of jobs) {
  if (!byArc.has(j.row.arc)) byArc.set(j.row.arc, []);
  byArc.get(j.row.arc).push(j);
}
console.log(`arcs touched: ${byArc.size}`);
console.log(`packs touched: ${[...new Set(jobs.map((j) => j.row.pack))].join(', ')}\n`);

// ---------------------------------------------------------------- re-encode
const built = [];
const encoded = new Map();
for (const j of jobs) {
  const outTex = path.join(OUT, `${j.stem}.tex`);
  if (!encoded.has(j.stem)) {
    try {
      execFileSync(PY, [path.join(HERE, 'tex_android.py'), 'encode', j.tex, j.png, outTex], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (e) {
      console.error(`  ENCODE FAILED ${j.stem}: ${(e.stderr || '').toString().trim().split('\n').pop()}`);
      process.exit(1);
    }
    const origSize = fs.statSync(j.tex).size;
    const newSize = fs.statSync(outTex).size;
    if (origSize !== newSize) {
      console.error(`  SIZE MISMATCH ${j.stem}: ${origSize} -> ${newSize}`);
      process.exit(1);
    }
    encoded.set(j.stem, newSize);
    console.log(`  ok ${j.stem.slice(0, 60).padEnd(62)} ${newSize} B  ${j.row.format}`);
  }
  built.push({ ...j, outTex, newSize: encoded.get(j.stem) });
}

if (DRY) {
  console.log('\n--dry-run: stopping before patching archives');
  process.exit(0);
}

// ---------------------------------------------------------------- patch arcs
// Which packs do these arcs live in?
const packOf = new Map(); // arc -> pack name
for (const b of built) {
  const pack = packOf.get(b.row.arc);
  if (pack && pack !== b.row.pack) {
    console.error(`arc ${b.row.arc} appears in both ${pack} and ${b.row.pack}`);
    process.exit(1);
  }
  packOf.set(b.row.arc, b.row.pack);
}

const packArcs = new Map(); // pack -> [arc]
for (const [arc, pack] of packOf) {
  if (!packArcs.has(pack)) packArcs.set(pack, []);
  packArcs.get(pack).push(arc);
}

const run = (cmd, args) => execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] }).toString();
const newArcs = new Map();

for (const [pack, arcs] of packArcs) {
  console.log(`\n=== ${pack} : ${arcs.length} arc(s) ===`);
  // manifest `pack` is the stem (GUI.00); the file on disk adds .fpk
  const srcPack = fs.existsSync(path.join(PACK_DIR, pack))
    ? path.join(PACK_DIR, pack)
    : path.join(PACK_DIR, `${pack}.fpk`);
  if (!fs.existsSync(srcPack)) {
    console.error(`  pack not found: ${srcPack}`);
    process.exit(1);
  }
  const work = path.join(OUT, pack);
  fs.mkdirSync(work, { recursive: true });
  const packFile = path.basename(srcPack); // e.g. GUI.00.fpk
  const packCopy = path.join(work, packFile);
  fs.copyFileSync(srcPack, packCopy);

  for (const arc of arcs) {
    const jobs2 = built.filter((b) => b.row.arc === arc);
    // pull the arc out of the pack
    let cur = path.join(work, path.basename(arc).replace(/\.arc$/i, '') + '.arc');
    run('node', [path.join(HERE, 'fpk-pull.cjs'), 'fpk-pull', packCopy, cur, arc]);
    // apply each texture in turn, chaining arc -> arc
    for (let i = 0; i < jobs2.length; i++) {
      const b = jobs2[i];
      const next = i === jobs2.length - 1 ? path.join(work, path.basename(arc)) : path.join(work, `step${i}.arc`);
      const res = run('node', [
        path.join(HERE, 'arc-edit.cjs'),
        cur,
        next,
        path.basename(b.row.entry).replace(/_NOMIP(_jpn)?$/i, ''),
        b.outTex,
        '--replace-entry-only',
      ]);
      const ok = /entries read back with the expected bytes/.test(res);
      const failed = (res.match(/FAILED: (.*)/) || [])[1];
      if (!ok) {
        console.error(`  arc-edit verify FAILED for ${b.stem}: ${failed || 'unknown'}`);
        console.error(res);
        process.exit(1);
      }
      console.log(`  ${ok ? 'ok' : '??'} ${path.basename(arc).padEnd(34)} ${b.stem.slice(0, 56)}`);
      // chain: next iteration reads the file we just wrote
      fs.renameSync(next, cur + '.tmp');
      fs.renameSync(cur + '.tmp', cur);
    }
    newArcs.set(arc, cur);
  }
  // one fpk-push per pack, applying each modified arc in turn
  for (const arc of arcs) {
    const target = newArcs.get(arc);
    const tmpPack = path.join(work, packFile + '.new');
    const res = run('node', [path.join(HERE, 'fpk-pull.cjs'), 'fpk-push', packCopy, tmpPack, path.basename(arc), target]);
    if (!/entries byte-identical to intent/.test(res)) {
      console.error(`  fpk-push verify FAILED for ${arc}`);
      console.error(res);
      process.exit(1);
    }
    fs.renameSync(tmpPack, packCopy);
  }
  console.log(`  pack rebuilt: ${packCopy}`);
}

console.log('\nAll packs rebuilt and verified into ' + OUT);
console.log('\nDeploy with:');
for (const pack of packArcs.keys()) {
  console.log(`  cp ${OUT}/${pack}/${pack.replace(/\.fpk$/i, '')}.fpk ${PACK_DIR}/${pack}`);
}
console.log(`  find ${path.dirname(PACK_DIR)}/../ -name download.list -delete   # then restart`);