// Probe the FWGS GUI layout format (Capcom's "GUI\0" widget tree).
//
// FWGS files live inside GUI*.fpk -> *.arc, under GUI/menu/ and GUI/result/.
// They are the widget tree the client builds each screen from, and each node
// carries a float rect -- so this is where a text box's real width lives.
//
// Confirmed so far on GUI_home_top.arc -> GUI/menu/menu_home_000:
//   0x00 "GUI\0" | 0x04 0x22214 | 0x08 total size | 0x10 "lhw\"
//   0x18..0x6c zero floats, then u32s; 0x1c=12, 0x20=1, 0x24=3 ...
//   a_ -prefixed node names in a block near the end (53 of them here)
//   immediately before that block: 177/38/177/19/354/38 floats then 512,512
//
// Usage: node fwgs-probe.cjs <file.bin> [--dump=N]
const fs = require('fs');

const [, , file, ...resto] = process.argv;
if (!file) {
  console.error('Uso: node fwgs-probe.cjs <file.bin> [--names] [--rects]');
  process.exit(1);
}
const d = fs.readFileSync(file);
const f32 = (o) => d.readFloatLE(o);
const u32 = (o) => d.readUInt32LE(o);

console.log(`${file}`);
console.log(`  size ${d.length} (0x${d.length.toString(16)})`);
console.log(`  magic ${JSON.stringify(d.toString('ascii', 0, 4))}`);
console.log(`  +0x04 0x${u32(4).toString(16)}  +0x08 ${u32(8)}`);
console.log(`  +0x10 ${JSON.stringify(d.toString('ascii', 0x10, 0x14))}`);
console.log(`  header u32: `);
let head = [];
for (let o = 0x18; o < 0x70; o += 4) head.push(u32(o));
console.log('    ' + head.join(' '));

// collect NUL-terminated names that look like identifiers
const names = [];
for (let o = 0; o < d.length; ) {
  const e = d.indexOf(0, o);
  if (e < 0) break;
  const s = d.toString('utf8', o, e);
  if (/^[A-Za-z_][A-Za-z0-9_\\.]{2,}$/.test(s)) names.push({ o, s });
  o = e + 1;
}
console.log(`\n  identifier-like names: ${names.length}`);
const aNames = names.filter((n) => n.s.startsWith('a_'));
console.log(`  a_* (widget ids): ${aNames.length}`);
if (aNames.length) {
  console.log(`  a_ block: 0x${aNames[0].o.toString(16)} .. 0x${aNames[aNames.length - 1].o.toString(16)}`);
}

// Test whether the a_ block is an array of fixed-size records: if the names are
// the final field, every (name offset - first offset) must be a whole number of
// strides, and name offset within its record must be constant.
if (aNames.length > 1) {
  const base = aNames[0].o;
  const innerOffsets = new Set(aNames.map((n) => n.o - base));
  console.log(`\n  distinct name offsets within block: ${[...innerOffsets].slice(0, 8)}`);
  for (const stride of [0x60, 0x64, 0x68, 0x6c, 0x70, 0x74, 0x78, 0x7c, 0x80, 0x90, 0xa0]) {
    const count = (aNames[aNames.length - 1].o - base) / stride + 1;
    if (Number.isInteger(count) && count === aNames.length) {
      console.log(`  FIXED STRIDE 0x${stride.toString(16)} -> ${count} records`);
    }
  }
}

// Walk backwards from the first a_ name looking for a plausible rect: 4 floats
// that are non-negative, and a 512/512 pair (the label atlas size) after them.
if (aNames.length) {
  const first = aNames[0].o;
  console.log(`\n  === candidate rects before first a_ name ===`);
  for (let back = 32; back <= 128; back += 4) {
    const p = first - back;
    if (p < 0) continue;
    const a = f32(p),
      b = f32(p + 4),
      c = f32(p + 8),
      e = f32(p + 12);
    if ([a, b, c, e].every((v) => Number.isFinite(v) && v >= 0 && v < 4000)) {
      const tw = f32(p + 24),
        th = f32(p + 28);
      const tag = tw === 512 && th === 512 ? '  <-- 512x512 atlas' : '';
      if (a !== 0 || b !== 0) {
        console.log(`   -${back} 0x${p.toString(16)}: x=${a} y=${b} w=${c} h=${e}  tw=${tw} th=${th}${tag}`);
      }
    }
  }
}

if (resto.includes('--names')) {
  console.log('\n  all a_ names:');
  aNames.forEach((n) => console.log(`    0x${n.o.toString(16).padStart(5)} ${n.s}`));
}
