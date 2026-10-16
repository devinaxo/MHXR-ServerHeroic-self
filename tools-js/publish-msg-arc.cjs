/*
 * Writes the rebuilt GUI.00.fpk into the server's download tree and bumps
 * RES_VER, so a translated-string edit actually reaches the client.
 *
 *   node publish-msg-arc.cjs
 *
 * Steps
 * -----
 * 1. Rebuild GUI_msg.arc from lavoro-traduzione/trad/*.json (build-msg-arc.cjs)
 * 2. Verify every string, and refuse to publish unless the string count per
 *    GMD file is unchanged (a wrong count means the client would look up the
 *    wrong key and show nonsense)
 * 3. Copy the new pack into the v0NNN tree and add the next v0NNN tree, because
 *    the client only ever moves one version forward at a time
 * 4. Bump RES_VER in src/constants/protocol.ts and regenerate the download
 *    manifests (they only regenerate when the files are deleted)
 *
 * Then bump the APK: see tools-js/pubblica-risorse.sh, which does the
 * stepwise d<old>_<new> diff directories the client actually walks.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { parseFpk } = require('./fpk-fmt.cjs');

const ROOT = path.resolve(__dirname, '..');
const DL = path.join(ROOT, 'src/public/res/download/android');
const TOOLS = path.join(ROOT, 'tools-js');

function sh(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { encoding: 'utf8', ...opts });
}

function main() {
  const dry = process.argv.includes('--dry');

  // Current version, from the protocol constant.
  const protocolPath = path.join(ROOT, 'src/constants/protocol.ts');
  const protocol = fs.readFileSync(protocolPath, 'utf8');
  const m = /RES_VER:\s*(\d+)/.exec(protocol);
  if (!m) throw new Error(`RES_VER not found in ${protocolPath}`);
  const resVer = Number(m[1]);
  const nuovo = resVer + 1;
  const cur = `v${String(resVer).padStart(4, '0')}`;
  const prossima = `v${String(nuovo).padStart(4, '0')}`;
  console.log(`RES_VER ${resVer} -> ${nuovo}  (${cur} -> ${prossima})`);

  const packIn = path.join(DL, cur, 'stdDL/cmn/GUI.00.fpk');
  if (!fs.existsSync(packIn)) throw new Error(`missing ${packIn}`);
  const packOut = path.join(os.tmpdir(), 'GUI.00.msg.rebuilt.fpk');

  // 1+2: rebuild and verify.
  const check = sh('node', [path.join(TOOLS, 'build-msg-arc.cjs'), '--check', packIn]);
  process.stdout.write(check);
  sh('node', [path.join(TOOLS, 'build-msg-arc.cjs'), packIn, packOut]);

  const prima = parseFpk(fs.readFileSync(packIn));
  const dopo = parseFpk(fs.readFileSync(packOut));
  if (prima.entries.length !== dopo.entries.length) {
    throw new Error(`entry count changed: ${prima.entries.length} -> ${dopo.entries.length}`);
  }
  for (let i = 0; i < prima.entries.length; i++) {
    if (prima.entries[i].filePath !== dopo.entries[i].filePath) {
      throw new Error(`entry ${i} path changed`);
    }
  }
  console.log(`pack verificato: ${dopo.entries.length} voci, ${dopo.header.compression} compressione`);

  /*
   * Self-consistency check on the rebuilt arc, before anything is written.
   *
   * Each entry stores the compressed size at +0x44, the data at +0x4c, and
   * 0x40000000 | uncompressed-size at +0x48. If that last field disagrees with
   * what actually inflates, the client misparses the archive and the game dies
   * on startup before the title screen. This cost two broken releases (288 and
   * 289 -- 289 fixed the FPK padding field but not this one), so it is checked
   * every time now.
   */
  const zlib = require('node:zlib');
  const { Blowfish } = require('egoroof-blowfish');
  const ARC_KEY = 'kaseoa nkaeka;eawf3';
  const DIM_VOCE = 80;
  const inverti = (buf) => {
    const out = Buffer.alloc(buf.length);
    for (let i = 0; i + 3 < buf.length; i += 4) {
      out[i] = buf[i + 3];
      out[i + 1] = buf[i + 2];
      out[i + 2] = buf[i + 1];
      out[i + 3] = buf[i];
    }
    const rest = buf.length % 4;
    if (rest > 0) buf.copy(out, buf.length - rest, buf.length - rest);
    return out;
  };
  const decifra = (buf) => {
    const bf = new Blowfish(ARC_KEY, Blowfish.MODE.ECB, Blowfish.PADDING.NULL);
    const g = inverti(buf);
    let c = Buffer.from(bf.decode(g, Blowfish.TYPE.UINT8_ARRAY));
    if (c.length < g.length) c = Buffer.concat([c, Buffer.alloc(g.length - c.length)]);
    return inverti(c);
  };

  const nuovoArc = dopo.entries.find((e) => /GUI_msg\.arc$/.test(e.filePath)).data;
  const corpo = decifra(nuovoArc.subarray(8));
  const nVoci = nuovoArc.readUInt16LE(6);
  let coerenti = 0;
  for (let i = 0; i < nVoci; i++) {
    const o = i * DIM_VOCE;
    const comp = corpo.readUInt32LE(o + 68);
    const flag = corpo.readUInt32LE(o + 72) >>> 0;
    const start = corpo.readUInt32LE(o + 76) - 8;
    const nome = corpo.subarray(o, o + 64).toString('utf8').replace(/\0.*$/, '');
    const gonfio = zlib.inflateSync(corpo.subarray(start, start + comp)).length;
    const tagOk = (corpo.readUInt32LE(o + 64) >>> 0) === 0x242bb29a;
    if (tagOk && (flag & 0x3fffffff) === gonfio && (flag >>> 30) === 1) {
      coerenti++;
    } else {
      throw new Error(`${nome}: voce incoerente (flag 0x${flag.toString(16)} per ${gonfio} byte, tag ${tagOk ? 'ok' : 'ko'})`);
    }
  }
  console.log(`verifica arc: ${coerenti}/${nVoci} voci coerenti`);

  if (dry) {
    console.log('\n--dry: nothing written.');
    console.log(`would replace ${packIn}`);
    console.log(`would point   ${prossima} -> v0282`);
    console.log(`would set RES_VER = ${nuovo} in ${protocolPath}`);
    return;
  }


  /*
   * 3: publish into the real store, then make the new version tree a symlink to
   * it, the way v0286 and v0287 already are. Creating a real directory here
   * would shadow the store and leave the client with a tree holding only the one
   * pack that changed.
   */
  fs.copyFileSync(packOut, packIn);
  const nuovaDir = path.join(DL, prossima);
  if (fs.existsSync(nuovaDir) || fs.lstatSync(nuovaDir, { throwIfNoEntry: false })) {
    fs.rmSync(nuovaDir, { recursive: true, force: true });
  }
  fs.symlinkSync(path.basename(cur.replace(/\/stdDL\/.*$/, '')), nuovaDir);
  console.log(`scritto ${packIn}`);
  console.log(`${prossima} -> ${fs.readlinkSync(nuovaDir)}`);

  fs.writeFileSync(protocolPath, protocol.replace(/RES_VER:\s*\d+/, `RES_VER: ${nuovo}`));
  console.log(`RES_VER = ${nuovo}`);

  // 4: manifests only regenerate when the files are missing.
  const manifests = [];
  const find = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) find(p);
      else if (e.name === 'download.list') manifests.push(p);
    }
  };
  find(DL);
  for (const p of manifests) {
    fs.unlinkSync(p);
    console.log(`rimosso ${path.relative(ROOT, p)} (si rigenera al riavvio)`);
  }

  console.log('\nProssimi passi:');
  console.log(`  1. ricostruisci e riavvia:  docker compose -f docker-compose.prod.yml up -d --build server`);
  console.log(`  2. pubblica i pacchetti:   tools-js/pubblica-risorse.sh   (prepara d${resVer}_${nuovo})`);
  console.log(`  3. reinstalla l'APK con la nuova versione delle risorse`);
}

main();