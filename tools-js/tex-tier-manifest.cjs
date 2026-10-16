// Add priority tiers and categories to dump/manifest.json, and rewrite the CSV
// so the dump can be sorted by what to translate first.
//
//   node tools-js/tex-tier-manifest.cjs [--dump dump]
//
// Tier rules (edit TIER_RULES to change them; they are matched against the arc
// path inside the pack, in order, first match wins):
//
//   T1  every screen / every session -> shared UI chrome, the main menu, home
//   T2  core gameplay loop           -> quest, results, equipment
//   T3  situational screens          -> character creation, shop, chat, guild...
//   T4  event / banner art           -> expired events, rotating banners
//
// `jpn` marks textures whose filename ends in _jpn, which is the game's own
// marker for art with baked-in Japanese text. `decodable` says whether a local
// decode is possible (RGBA4/RGBA8/R5G6B5 yes; PVRTC4/ETC1 no -- those need
// RevilToolset).
const fs = require('fs');
const path = require('path');

const DUMP = (() => {
  const hit = process.argv.find((a) => a.startsWith('--dump='));
  return hit ? hit.split('=').slice(1).join('=') : 'dump';
})();

// Ordered, first match wins. `re` is tested against the arc path inside the
// pack, `entryRe` against the texture entry path; a rule matches if either hits.
const TIER_RULES = [
  {
    tier: 1,
    label: 'every screen',
    re: /GUI_(cmn|home_common|home_menu|home_equip|home_top)\.arc$/,
  },
  {
    tier: 2,
    label: 'core loop',
    // quest / result / equipment screens, plus skill-name art, which is on
    // screen constantly in the equip and status menus
    re: /GUI_(quest|home_quest|result|16Multi_result|equip_detail|equip_list|equip_menu|equip_confirm)\.arc$/,
    entryRe: /^GUI\/tex\/(skill_name|monster_skill_name)\//,
  },
  {
    tier: 4,
    label: 'event / banner',
    // rotating and expiring content: event banners, event titles, non-UI assets
    re: /ex_tex\/(banner|event)|event_home\/|EVENTINFO|^stage\/|^effect\//,
    entryRe: /^GUI\/(external_tex\/(banner|event)|ex_tex\/(banner|event))/,
  },
  { tier: 3, label: 'situational', re: /GUI\// },
  { tier: 3, label: 'situational', entryRe: /^GUI\// },
  { tier: 4, label: 'other assets', re: /.*/ },
];

// category, first match wins
const TIER_LABELS = { 1: 'every screen', 2: 'core loop', 3: 'situational', 4: 'event / banner' };

const CATEGORIES = [
  ['layout', /^GUI\/menu\//],
  ['common', /^GUI\/tex\/cmn\//],
  ['skill name', /^GUI\/tex\/skill_name|monster_skill_name/],
  ['menu', /^GUI\/tex\/menu\//],
  ['quest', /^GUI\/tex\/quest\//],
  ['result', /^GUI\/tex\/result\//],
  ['equip', /^GUI\/tex\/equip|chara_edit|armor|weapon/],
  ['character', /^GUI\/(external_tex\/chara|tex\/chara)/],
  ['otomo', /^GUI\/(tex\/otomo|external_tex\/otomo)/],
  ['map', /^GUI\/(tex\/map|external_tex\/map)/],
  ['town', /^GUI\/tex\/town/],
  ['guild', /^GUI\/tex\/guild/],
  ['treasure', /^GUI\/tex\/treasure/],
  ['event', /^GUI\/(tex\/event|external_tex\/event)/],
  ['banner', /^GUI\/(external_tex\/banner|ex_tex\/banner|external_tex\/event_tit_banner)/],
  ['icon', /icon/],
  ['title', /syougou/],
  ['effect', /^effect\//],
  ['stage', /^stage\//],
  ['other', /.*/],
];

// PVRTC4/ETC1/BC3 became decodable once `pip install texture2ddecoder` landed;
// see DECODABLE_FORMATS in tex_batch_decode.py.
const DECODABLE = new Set(['RGBA4', 'RGBA8', 'R5G6B5', 'PVRTC4', 'ETC1', 'BC3']);

const file = path.join(DUMP, 'manifest.json');
if (!fs.existsSync(file)) {
  console.error(`${file} not found -- run tools-js/gui-tex-dump.cjs first`);
  process.exit(1);
}
const records = JSON.parse(fs.readFileSync(file));

const tierFor = (r) => {
  const arc = r.arc.replace(/^\/+/, '');
  const hit = TIER_RULES.find((t) => (t.re && t.re.test(arc)) || (t.entryRe && t.entryRe.test(r.entry)));
  return hit ? hit.tier : 4;
};
const categoryFor = (entry) => {
  const hit = CATEGORIES.find(([, re]) => re.test(entry));
  return hit ? hit[0] : 'other';
};

let changed = 0;
for (const r of records) {
  const tier = tierFor(r);
  const cat = categoryFor(r.entry);
  const jpn = /_jpn/i.test(r.entry) ? 1 : 0;
  const dec = DECODABLE.has(r.format) ? 1 : 0;
  if (r.tier !== tier || r.category !== cat || r.jpn !== jpn || r.decodable !== dec) changed++;
  Object.assign(r, { tier, tier_label: TIER_LABELS[tier], jpn, decodable: dec, category: cat });
}

fs.writeFileSync(file, JSON.stringify(records, null, 1));

const cols = ['pack', 'tier', 'tier_label', 'jpn', 'decodable', 'category', 'arc', 'entry', 'format', 'type', 'width', 'height', 'size', 'sha256', 'tex_path', 'status'];
const csv = [
  cols.join(','),
  ...records.map((r) => cols.map((c) => {
    const v = String(r[c] ?? '');
    return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  }).join(',')),
].join('\n');
fs.writeFileSync(path.join(DUMP, 'manifest.csv'), csv + '\n');

// --- summary ---------------------------------------------------------------
const byTier = {};
const byTierJpn = {};
for (const r of records) {
  byTier[r.tier] = byTier[r.tier] || { n: 0, jpn: 0, dec: 0 };
  byTier[r.tier].n++;
  if (r.jpn) byTier[r.tier].jpn++;
  if (r.decodable) byTier[r.tier].dec++;
  if (r.jpn) {
    const k = `T${r.tier} ${r.category}`;
    byTierJpn[k] = (byTierJpn[k] || 0) + 1;
  }
}
const work = records.filter((r) => r.jpn && r.decodable && r.status !== 'duplicate');
const blocked = records.filter((r) => r.jpn && !r.decodable && r.status !== 'duplicate');

console.log(`manifest updated (${changed} rows touched) -> ${DUMP}/manifest.csv`);
console.log('\ntier   meaning          textures   _jpn   decodable');
for (const t of [1, 2, 3, 4]) {
  const s = byTier[t] || { n: 0, jpn: 0, dec: 0 };
  console.log(`T${t}     ${TIER_LABELS[t].padEnd(16)} ${String(s.n).padStart(8)}  ${String(s.jpn).padStart(6)}  ${String(s.dec).padStart(9)}`);
}
console.log(`\n_worklist: ${work.length} unique _jpn textures you can edit right now`);
console.log(`_blocked:  ${blocked.length} unique _jpn textures need RevilToolset (PVRTC4/ETC1)`);
console.log('\nT1+T2 worklist size: ' + work.filter((r) => r.tier <= 2).length);
console.log('\n_jpn worklist by tier and category:');
Object.entries(byTierJpn).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(`  ${String(v).padStart(4)}  ${k}`));
