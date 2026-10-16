// Snapshot the resource packs we have modified, one folder per published
// version, so any publish can be rolled back with a plain file copy.
//
//   node tools-js/backup-packs.cjs <label> [pack ...]
//   node tools-js/backup-packs.cjs res-0326
//   node tools-js/backup-packs.cjs res-0327 cmn/GUI.00.fpk cmn/resident.00.fpk
//
// Copies from src/public/res/download/android/v0282/stdDL/<pack> to
// backups/<label>/<pack>. Writing a backup is safe and cheap: only the packs
// named are copied, and the default is just the one texture work touches.
//
// Rollback is then a byte-identical restore, which matters: every revert that
// went through arc-edit (which REBUILDS an archive) behaved differently from one
// that dropped the original bytes back in. A backup preserves the exact bytes.
const fs = require('fs');
const path = require('path');

const HERE = __dirname;
const REPO = path.resolve(HERE, '..');
const SRC = path.join(REPO, 'src/public/res/download/android/v0282/stdDL');
const BACKUPS = path.join(REPO, 'backups');
const DEFAULT_PACKS = ['cmn/GUI.00.fpk'];

const [, , label, ...rest] = process.argv;
if (!label) {
  console.error('uso: node tools-js/backup-packs.cjs <label> [pack ...]');
  process.exit(1);
}
const packs = rest.length ? rest : DEFAULT_PACKS;
const dest = path.join(BACKUPS, label);
fs.mkdirSync(dest, { recursive: true });

let copied = 0;
let bytes = 0;
for (const p of packs) {
  const from = path.join(SRC, p);
  if (!fs.existsSync(from)) {
    console.error(`  missing: ${p}`);
    process.exit(1);
  }
  const to = path.join(dest, p);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
  const n = fs.statSync(to).size;
  copied++;
  bytes += n;
  console.log(`  ${p.padEnd(28)} ${(n / 1048576).toFixed(1)} MB`);
}

// a tiny manifest so a backup is self-describing
const meta = {
  label,
  createdAt: new Date().toISOString(),
  packs: packs.map((p) => ({ path: p, size: fs.statSync(path.join(dest, p)).size })),
};
fs.writeFileSync(path.join(dest, 'backup.json'), JSON.stringify(meta, null, 1));

console.log(`backed up ${copied} pack(s), ${(bytes / 1048576).toFixed(1)} MB -> backups/${label}/`);
console.log('rollback:  cp backups/' + label + '/<pack> ' + path.relative(REPO, path.join(SRC, '<pack>')));
