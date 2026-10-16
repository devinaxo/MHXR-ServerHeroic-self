// Confronta due FPK (un pack "reference" integro e uno "candidate" sospetto)
// a livello di contenitore, non di pixel: header FPK, tabella voci, e per ogni
// ARC l'header, la tabella degli 80-byte record e l'allineamento dei corpi.
//
//   node tools-js/confronta-pack.cjs <reference.fpk> <candidate.fpk> [--json]
//   node tools-js/confronta-pack.cjs --arc <reference.arc> <candidate.arc>
//
// Serve a rispondere alla domanda: quando una texture "rompe" la schermata, e'
// colpa del contenuto della texture o della ricostruzione del contenitore?
// Se il candidato e' rigenerato dai byte pristine e la texture e' l'unica
// differenza ma l'ARC differisce per header/record/allineamento, il colpevole
// e' il packer, non l'artwork.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { Blowfish } = require('egoroof-blowfish');

const ARC_KEY = 'kaseoa nkaeka;eawf3';
const bf = new Blowfish(ARC_KEY, Blowfish.MODE.ECB, Blowfish.PADDING.NULL);

// ---- cipher helpers (stessa convenzione di fpk-align.cjs) -----------------
function inv(b) {
  const o = Buffer.alloc(b.length);
  const n = b.length - (b.length % 4);
  for (let i = 0; i < n; i += 4) { o[i] = b[i + 3]; o[i + 1] = b[i + 2]; o[i + 2] = b[i + 1]; o[i + 3] = b[i]; }
  if (b.length % 4) b.copy(o, n, n);
  return o;
}
const dec = (b) => {
  const g = inv(b);
  let c = Buffer.from(bf.decode(g, Blowfish.TYPE.UINT8_ARRAY));
  if (c.length < g.length) c = Buffer.concat([c, Buffer.alloc(g.length - c.length)]);
  return inv(c);
};

// ---- FPK ------------------------------------------------------------------
function parseFpk(buf) {
  if (buf.length < 16 || buf.toString('ascii', 0, 4) !== 'FPK\0') throw new Error('non e\' un FPK');
  const fileCount = buf.readUInt16LE(0x0e);
  const entries = [];
  for (let i = 0; i < fileCount; i++) {
    const o = 16 + i * 80;
    const raw = Buffer.from(buf.subarray(o, o + 64));
    const nul = raw.indexOf(0);
    const p = raw.toString('utf-8', 0, nul === -1 ? 64 : nul);
    entries.push({
      i, path: p,
      size: buf.readUInt32LE(o + 68),
      sizeAndFlags: buf.readUInt32LE(o + 72),
      offset: buf.readUInt32LE(o + 76),
    });
  }
  return { header: buf.subarray(0, 16), fileCount, entries, buf };
}

// ---- ARC ------------------------------------------------------------------
// Restituisce la struttura dell'ARC: header, tabella record, allineamento.
function parseArc(arc) {
  if (arc.toString('ascii', 0, 4) !== 'ARCC') return null;
  const count = arc.readUInt16LE(6);
  const body = dec(arc.subarray(8));
  const voci = [];
  let firstBody = Infinity;
  for (let i = 0; i < count; i++) {
    const o = i * 80;
    const cs = body.readUInt32LE(o + 68);            // compressed size
    const us = body.readUInt32LE(o + 72);            // uncompressed | flag
    const off = body.readUInt32LE(o + 76);           // body offset + 8
    const tag = body.readUInt32LE(o + 64);
    const rawPath = body.subarray(o, o + 64);
    const nul = rawPath.indexOf(0);
    const start = off - 8;
    if (start < firstBody) firstBody = start;
    let inflate = null;
    if (start >= 0 && start + cs <= body.length) {
      try { inflate = zlib.inflateSync(body.subarray(start, start + cs)).length; } catch { inflate = -1; }
    }
    voci.push({
      i,
      path: rawPath.toString('utf-8', 0, nul === -1 ? 64 : nul),
      tag, cs, us, off, start, inflate,
      csAlign: cs % 8 === 0, offAlign: start % 8 === 0,
    });
  }
  return {
    version: arc.readUInt16LE(4),
    count,
    headerBytes: Buffer.from(arc.subarray(0, 8)),
    bodyLen: body.length,
    tableEnd: count * 80,
    firstBody: firstBody === Infinity ? count * 80 : firstBody,
    gapAfterTable: (firstBody === Infinity ? count * 80 : firstBody) - count * 80,
    voci,
    body,
    arcLen: arc.length,
  };
}

const hex = (n, w = 8) => '0x' + (n >>> 0).toString(16).padStart(w, '0');
const sha16 = (b) => require('crypto').createHash('sha256').update(b).digest('hex').slice(0, 16);

function compareArc(refArc, candArc, label, problems) {
  const a = parseArc(refArc);
  const b = parseArc(candArc);
  if (!a || !b) return { label, type: 'non-arc' };
  const diffs = [];
  if (a.version !== b.version) diffs.push(`version ${a.version} -> ${b.version}`);
  if (a.count !== b.count) diffs.push(`entry count ${a.count} -> ${b.count}`);
  if (!a.headerBytes.equals(b.headerBytes)) diffs.push(`header ${a.headerBytes.toString('hex')} -> ${b.headerBytes.toString('hex')}`);
  if (a.bodyLen !== b.bodyLen) diffs.push(`body length ${a.bodyLen} -> ${b.bodyLen}`);
  if (a.gapAfterTable !== b.gapAfterTable) diffs.push(`gap after table ${a.gapAfterTable} -> ${b.gapAfterTable}`);

  let misalignedCs = 0, misalignedOff = 0, inflateFail = 0, contentChanged = 0;
  const n = Math.min(a.count, b.count);
  const changedEntries = [];
  for (let i = 0; i < n; i++) {
    const ra = a.voci[i], rb = b.voci[i];
    if (ra.path !== rb.path) { changedEntries.push(`${ra.path || '#' + i}: path -> ${rb.path}`); continue; }
    if (!rb.csAlign) misalignedCs++;
    if (!rb.offAlign) misalignedOff++;
    if (rb.inflate === -1 || rb.inflate === null) inflateFail++;
    const tagDiff = ra.tag !== rb.tag;
    const sizeDiff = ra.cs !== rb.cs || (ra.us & 0x3fffffff) !== (rb.us & 0x3fffffff);
    const flagDiff = (ra.us >>> 30) !== (rb.us >>> 30);
    // il contenuto (post-inflate) e' cambiato?
    let contentDiff = false;
    try {
      const da = zlib.inflateSync(a.body.subarray(ra.start, ra.start + ra.cs));
      const db = zlib.inflateSync(b.body.subarray(rb.start, rb.start + rb.cs));
      contentDiff = !da.equals(db);
    } catch { contentDiff = true; }
    if (tagDiff) changedEntries.push(`${ra.path}: tag ${hex(ra.tag)} -> ${hex(rb.tag)}`);
    if (flagDiff) changedEntries.push(`${ra.path}: flag ${hex(ra.us)} -> ${hex(rb.us)} (0x${(ra.us >>> 30).toString(2)} -> 0x${(rb.us >>> 30).toString(2)})`);
    if (sizeDiff) changedEntries.push(`${ra.path}: size ${ra.cs}/${ra.us & 0x3fffffff} -> ${rb.cs}/${rb.us & 0x3fffffff}`);
    if (contentDiff) { contentChanged++; }
  }
  const bad = misalignedCs || misalignedOff || inflateFail;
  if (bad) problems.push(`${label}: misalignedCs=${misalignedCs} misalignedOff=${misalignedOff} inflateFail=${inflateFail}`);
  if (diffs.length || changedEntries.length || contentChanged) {
    return { label, type: 'arc', diffs, changedEntries, contentChanged, misalignedCs, misalignedOff, inflateFail };
  }
  return { label, type: 'identical' };
}

// ---- modalita' FPK --------------------------------------------------------
function compareFpk(refPath, candPath) {
  const ref = parseFpk(fs.readFileSync(refPath));
  const cand = parseFpk(fs.readFileSync(candPath));
  const problems = [];
  const out = [];
  console.log(`reference: ${refPath}  (${ref.buf.length} byte, ${ref.fileCount} voci)`);
  console.log(`candidate: ${candPath}  (${cand.buf.length} byte, ${cand.fileCount} voci)`);
  if (ref.fileCount !== cand.fileCount) console.log(`!! numero voci FPK diverso: ${ref.fileCount} vs ${cand.fileCount}`);
  if (!ref.header.equals(cand.header)) console.log(`!! header FPK diverso: ${ref.header.toString('hex')} vs ${cand.header.toString('hex')}`);

  const candByPath = new Map(cand.entries.map((e) => [e.path, e]));
  for (const re of ref.entries) {
    const ce = candByPath.get(re.path);
    if (!ce) { console.log(`-- mancante nel candidato: ${re.path}`); continue; }
    if (re.sizeAndFlags !== ce.sizeAndFlags) console.log(`!! flags FPK ${re.path}: ${hex(re.sizeAndFlags)} -> ${hex(ce.sizeAndFlags)}`);
    const arc = compareArc(
      ref.buf.subarray(re.offset, re.offset + re.size),
      cand.buf.subarray(ce.offset, ce.offset + ce.size),
      re.path,
      problems,
    );
    if (arc.type === 'arc' && (arc.diffs.length || arc.changedEntries.length)) out.push(arc);
    if (arc.type === 'non-arc') out.push({ label: re.path, type: 'non-arc' });
  }
  console.log(`\n--- ARC che differiscono (struttura o record) ---`);
  if (!out.length) console.log('  (nessuno)');
  for (const a of out) {
    console.log(`\n${a.label}  [${a.type}]`);
    if (a.type === 'non-arc') continue;
    for (const d of a.diffs) console.log(`   header: ${d}`);
    console.log(`   entry con contenuto diverso: ${a.contentChanged}`);
    if (a.changedEntries.length) {
      console.log(`   record diversi (${a.changedEntries.length}):`);
      for (const c of a.changedEntries.slice(0, 40)) console.log(`     - ${c}`);
      if (a.changedEntries.length > 40) console.log(`     ... altri ${a.changedEntries.length - 40}`);
    }
  }
  console.log(`\n--- Problemi di integrita' del contenitore ---`);
  if (!problems.length) console.log('  nessuno: tutti gli ARC del candidato hanno record allineati e corpi che gonfiano');
  for (const p of problems) console.log(`  !! ${p}`);
}

const argv = process.argv.slice(2);
if (argv[0] === '--arc') {
  const refPath = argv[1];
  const candPath = argv[2];
  const problems = [];
  const r = compareArc(fs.readFileSync(refPath), fs.readFileSync(candPath), path.basename(refPath), problems);
  console.log(JSON.stringify(r, null, 2));
} else {
  const [refPath, candPath] = argv.filter((a) => !a.startsWith('--'));
  if (!refPath || !candPath) { console.error('uso: node confronta-pack.cjs <reference.fpk> <candidate.fpk>'); process.exit(1); }
  compareFpk(refPath, candPath);
}
