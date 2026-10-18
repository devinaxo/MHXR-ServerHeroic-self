/*
 * Genera il dizionario JP -> EN delle note delle isole.
 *
 *   node lavoro-traduzione/map/genera-isole.cjs [part_info] [uscita.json]
 *
 * Perche' esiste
 * ---------------
 * Le note che il client mostra nel pannello dell'isola (nome + descrizione
 * prima e dopo l'esplorazione) vivono in resident.00.fpk :: rsdnt_map.arc ::
 * tuning/xml/ocean/part/part_info, nei campi mPartName, mDescBefore e
 * mDescAfter. Sono ancora in giapponese: questo script le accoppia a una
 * traduzione inglese scritta a mano e produce un dizionario piatto
 * { "giapponese": "inglese" } che traduci-rsdnt-arc.cjs sa applicare.
 *
 * I nomi inglesi seguono quelli gia' usati nei dialoghi (GUI.78-94), cosi' la
 * mappa e la storia chiamano ogni isola allo stesso modo:
 *   Marakuja, Rambai, Feijoa, Cupuacu, Canistel, Pitanga, Tripuu, Pupunha,
 *   Belen, Chiricheri, Sowaal, Volhier, Labrau, Isilruta, Urus, Sebekuru,
 *   Gagateto, Tabradin.
 *
 * Il pannello della nota e' alto circa quattro righe: lo script rifiuta una
 * riga oltre 44 caratteri o una descrizione oltre quattro righe, cosi' una
 * traduzione lunga non viene tagliata dal client.
 */
const fs = require('node:fs');
const path = require('node:path');
const { parseXfs } = require('../../tools-js/xfs-parse.cjs');

const ENTRATA =
  process.argv[2] ?? path.resolve(__dirname, '../../build/map/ext/tuning/xml/ocean/part/part_info');
const USCITA = process.argv[3] ?? path.resolve(__dirname, 'isole.json');

const MAX_RIGA = 44;
const MAX_RIGHE = 4;

/*
 * Una voce per isola, indicizzata dal nome giapponese originale (cosi' un
 * riordino dei dati non sposta la traduzione).
 */
const ISOLE = {
  マラクジャ島: {
    nome: 'Marakuja Island',
    prima:
      'The gateway island of the Shattered\nArchipelago, the first seen past the\nFracture Zone, where Shambal port thrives.',
    dopo: 'Word spread at once that a treasure\nwas found on this island, now a base\nfor development. Explorers still seek here.',
  },
  ランバイ島: {
    nome: 'Rambai Island',
    prima:
      'Close to Marakuja Island, this island\ndraws attention as the next new base.\nBut its wilds are harsh and people fight on.',
    dopo: 'Because it draws attention as a new base,\nsome explorers break the rules, and the\nGuild keeps a wary eye on them.',
  },
  フェイジョア島: {
    nome: 'Feijoa Island',
    prima:
      'An island of varied environments,\nfrom eastern reefs to western sands.\nHarsh land stays wild, hidden by nature.',
    dopo: 'Hidden by nature, malicious explorers\ncause endless harm, so the Guild is\nconsidering measures against them.',
  },
  クプアス島: {
    nome: 'Cupuacu Island',
    prima:
      "A bitterly cold island revealing the\nArchipelago's strange climate. Its own\nworld of hazards and complex life.",
    dopo: 'Lately the malicious explorers who\nplagued the Guild were driven off on\nthis dangerous island, restoring order.',
  },
  カニステル島: {
    nome: 'Canistel Island',
    prima:
      'An island where countless mountains\nblock the way. Frequent wildfires and\nmonster rampages leave an uneasy air.',
    dopo: 'The greatest wildfire in exploration\nhistory ravaged the island. Was it the\nunease in the air? The Guild took action.',
  },
  ピタンガ島: {
    nome: 'Pitanga Island',
    prima:
      "An island blocked by a merciless\nvolcano, its magma seething. Deep\nwithin lurks the Archipelago's threat.",
    dopo: 'The crisis closing in on the Marakuja\nArchipelago was struck down by a young\nexplorer, praised above all by the people.',
  },
  トリプー島: {
    nome: 'Tripuu Island',
    prima:
      'A base of the Volhier Archipelago,\nstrangely shaped. Its ruling shrine maiden\nis said to hold rites at the altar here.',
    dopo: 'The Volhier Archipelago, where explorers\ndream of landing. News of a treasure\nfound on its base island stirred them all.',
  },
  ププーニャ島: {
    nome: 'Pupunha Island',
    prima:
      'An island of complex environments where\nvolcanoes and snowfields mix. For the\nmonsters there too, survival is harsh.',
    dopo: "The volcanic gas covering the island was\npushed back by one explorer's efforts.\nThat feat will long matter to those to come.",
  },
  ベレン島: {
    nome: 'Belen Island',
    prima:
      'A vast island held sacred by those\nwho live in this Archipelago. One legend\nsays a place here warns of coming crisis.',
    dopo: "The truth of the flower garden that\nquietly warned of the island's peril\nshocked every explorer. The Guild warns on.",
  },
  チリチェリ島: {
    nome: 'Chiricheri Island',
    prima:
      'An island with a shrine revered\nthroughout the Archipelago. Its risen\nground and vast desert came from punishment.',
    dopo: "Building a shrine in a disaster-prone\nplace was inevitable, but this island's\nsplitting surpassed all imagination.",
  },
  ソワエール島: {
    nome: 'Sowaal Island',
    prima:
      'An island forbidden to all who live\nin the Archipelago. Records call it lush,\nyet endless white sand covers it.',
    dopo: 'The islanders crowded the Guild in fear\nof the crisis about to befall them.\nOne explorer set out to clear that crisis.',
  },
  ヴォルヒール島: {
    nome: 'Volhier Island',
    prima:
      'The last island of the Volhier\nArchipelago. Jagged peaks and frequent\nlightning, yet a strange green glow appears.',
    dopo: 'Rumor says one explorer saved the\nisland from crisis. The Guild keeps the\ntruth, but its new welcome is proof enough.',
  },
  ラブラウ島: {
    nome: 'Labrau Island',
    prima:
      'Now seen as the first island of this\nnewly found Archipelago. Hopes rest on\nwhy it turned to desert and its isles sank.',
    dopo: 'A new small monster, the Apypos, was\nfound. A Guild undersea survey also found\nover 20 traces of sunken islands nearby.',
  },
  イシルルタ島: {
    nome: 'Isilruta Island',
    prima:
      'The new monster and resonance crystal\nfound on Labrau Island raise hopes for\nmore. Yet desert covers much of this isle.',
    dopo: "A new monster, the Great Apypos, was\nfound. As the search for the desert's\ncause goes on, a native girl is sighted.",
  },
  ウルス島: {
    nome: 'Urus Island',
    prima:
      'Exploration began amid rising Guild\ntension, after the first sabotage.\nThe ruins and the culprit are urgent.',
    dopo: 'With many native settlements that may\nlink to a lost civilization, hope grows\nnow that a native descendant is protected.',
  },
  セベクル島: {
    nome: 'Sebekuru Island',
    prima:
      'The northern half is a chain of snow-\ncapped peaks. In the southern desert,\nmeltwater flows beneath, keeping it cold.',
    dopo: "The observation-deck ruins on the\nisland's highest peak show ancient\nand native use. Surveying them is desired.",
  },
  ガガテト島: {
    nome: 'Gagateto Island',
    prima:
      'With a great volcano at its northern\nend, the island is rugged, its lowlands\nmostly barren sand. Murals mark its valley.',
    dopo: 'A winged monster reappeared and was\nnamed Nef\u00b7Galmud. Only distant sightings\nremain, but ruins bear depictions of it.',
  },
  タブラディン島: {
    nome: 'Tabradin Island',
    prima:
      'Mostly barren desert and rock, the island\nsees dust turn the sky sand-colored.\nA giant blue crystal lies to the northeast.',
    dopo: 'With Nef\u00b7Galmud slain, the rapid\ndesertification is thought to have stopped,\nbut the ruin is severe and sinking goes on.',
  },
};

function controlla(etichetta, testo) {
  const righe = testo.split('\n');
  if (righe.length > MAX_RIGHE) {
    throw new Error(`${etichetta}: ${righe.length} righe (max ${MAX_RIGHE})`);
  }
  righe.forEach((r, i) => {
    if (r.length > MAX_RIGA)
      throw new Error(`${etichetta}: riga ${i + 1} = ${r.length} caratteri (max ${MAX_RIGA})`);
  });
}

const doc = parseXfs(fs.readFileSync(ENTRATA));
const parti = doc.root.mDataList.mpArray;
if (parti.length !== Object.keys(ISOLE).length) {
  throw new Error(`attese ${Object.keys(ISOLE).length} isole, trovate ${parti.length}`);
}

const diz = {};
const uscita = [];
for (const p of parti) {
  const voce = ISOLE[p.mPartName];
  if (!voce) throw new Error(`isola non mappata: ${p.mPartName}`);
  controlla(`${p.mPartName} nome`, voce.nome);
  controlla(`${p.mPartName} prima`, voce.prima);
  controlla(`${p.mPartName} dopo`, voce.dopo);
  diz[p.mPartName] = voce.nome;
  diz[p.mDescBefore] = voce.prima;
  diz[p.mDescAfter] = voce.dopo;
  uscita.push({ partName: p.mPartName, name: voce.nome });
}

if (Object.keys(diz).length !== parti.length * 3) {
  throw new Error('chiavi duplicate: due campi giapponesi coincidono');
}

fs.writeFileSync(USCITA, JSON.stringify(diz, null, 1) + '\n');
console.log(`${Object.keys(diz).length} voci -> ${USCITA}`);
for (const v of uscita) console.log(`  ${v.partName} = ${v.name}`);
