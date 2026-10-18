/*
 * Incontro casuale con un nuovo PALICO a fine missione.
 *
 * Il gioco non aveva nessun modo di ottenere gli altri palico: il box partiva
 * con i due di `user-defaults.json` e basta. Qui si pesca un palico non ancora
 * posseduto quando si completa una missione delle isole, lo si aggiunge al box
 * e `islandEnd` lo annuncia con `get_mst_otomo_id` (lo stesso campo che
 * l'originale teneva fisso a 2092467563, facendo credere di averlo vinto a ogni
 * caccia).
 *
 * La tabella vera e' `src/json/otomo-master.json` (OtomoParam in
 * rsdnt_otomo.arc, generata da tools-js/build-otomo-tables.cjs):
 *   - `charNo` costruisce l'otomo_id del box: OT_OTOMO_CHAR_ID_<charNo a 3 cifre>
 *   - `id` e' il mst_otomo_id (lo stesso che il client legge nel master)
 *   - `event=1` sono i palico delle collaborazioni / test: non devono uscire
 *   - charNo 0 (ブランク) e >= 200 (テスタ) sono segnaposto, esclusi.
 *
 * Frequenza: OTOMO_ENCOUNTER_CHANCE, percentuale intera (default 20). 0 spegne
 * gli incontri. La rarita' pesa: i palico comuni escono piu' spesso dei rari,
 * cosi' la collezione cresce in modo naturale invece di dare subito i migliori.
 */
import master from '../json/otomo-master.json' with { type: 'json' };

export interface OtomoMaster {
  charNo: number;
  id: number;
  name: string;
  type: number;
  maxLevel: number;
  rarity: number;
  event: number;
  release: number;
  initialSubskills: number[];
  mainSkills: number[];
}

export interface OtomoBoxCreato {
  created: number;
  exp: number;
  mst_otomo_id: number;
  otomo_id: string;
  subskill: number[];
  attack: number;
  defense: number;
  hp: number;
  level: number;
}

const OTOMOS = (master as { otomos: OtomoMaster[] }).otomos;

export const OTOMO_INCONTRO_CHANCE_PREDEFINITA = 20;

/** `OT_OTOMO_CHAR_ID_118` e' il formato che il client usa per `box.otomos[].otomo_id`. */
export function otomoIdDaCharNo(charNo: number): string {
  return `OT_OTOMO_CHAR_ID_${String(Math.max(0, Math.floor(charNo) || 0)).padStart(3, '0')}`;
}

/** Un palico che puo' davvero comparire: niente collaborazioni ne' righe di test. */
export function otomoOttenibile(otomo: OtomoMaster): boolean {
  return otomo.event === 0 && otomo.charNo > 0 && otomo.charNo < 200;
}

/** Percentuale di incontro da .env, limitata a 0..100. */
export function chanceIncontroOtomo(): number {
  const grezzo = process.env.OTOMO_ENCOUNTER_CHANCE?.trim();
  if (!grezzo) return OTOMO_INCONTRO_CHANCE_PREDEFINITA;
  const valore = Number(grezzo);
  if (!Number.isFinite(valore)) return OTOMO_INCONTRO_CHANCE_PREDEFINITA;
  return Math.min(100, Math.max(0, valore));
}

function giaPosseduto(otomo: OtomoMaster, posseduti: ReadonlySet<number>, ids: ReadonlySet<string>): boolean {
  return posseduti.has(otomo.id) || ids.has(otomoIdDaCharNo(otomo.charNo));
}

/** Il pool ancora da ottenere. */
export function otomoNonPosseduti(
  otomos: ReadonlyArray<{ mst_otomo_id?: number | null; otomo_id?: string | null }> | null | undefined,
): OtomoMaster[] {
  const posseduti = new Set<number>();
  const ids = new Set<string>();
  for (const o of otomos ?? []) {
    if (o?.mst_otomo_id != null) posseduti.add(o.mst_otomo_id);
    if (o?.otomo_id) ids.add(o.otomo_id);
  }
  return OTOMOS.filter((o) => otomoOttenibile(o) && !giaPosseduto(o, posseduti, ids));
}

/** Peso per rarita': rarita' 1 -> 5, 4 -> 2. I comuni escono piu' spesso. */
function pesoOtomo(otomo: OtomoMaster): number {
  return Math.max(1, 6 - (otomo.rarity || 1));
}

function pescaPonderata(pool: ReadonlyArray<OtomoMaster>, casuale: () => number): OtomoMaster {
  const pesi = pool.map(pesoOtomo);
  const totale = pesi.reduce((a, b) => a + b, 0);
  let punto = casuale() * totale;
  for (let i = 0; i < pool.length; i++) {
    punto -= pesi[i]!;
    if (punto < 0) return pool[i]!;
  }
  return pool[pool.length - 1]!;
}

/**
 * Estrae il palico da incontrare, oppure null (nessun drop, o li possiede gia'
 * tutti). `casuale` e `chance` sono iniettabili per i test.
 */
export function estraiOtomoIncontro(
  otomos: ReadonlyArray<{ mst_otomo_id?: number | null; otomo_id?: string | null }> | null | undefined,
  casuale: () => number = Math.random,
  chance: number = chanceIncontroOtomo(),
): OtomoMaster | null {
  if (!(chance > 0)) return null;
  if (casuale() * 100 >= Math.min(100, chance)) return null;
  const pool = otomoNonPosseduti(otomos);
  if (pool.length === 0) return null;
  return pescaPonderata(pool, casuale);
}

/** La riga da mettere in `box.otomos`. `created` e' in secondi, come il resto del box. */
export function creaOtomoIncontro(otomo: OtomoMaster, adesso: number = Date.now()): OtomoBoxCreato {
  return {
    created: Math.floor(adesso / 1000),
    exp: 0,
    mst_otomo_id: otomo.id,
    otomo_id: otomoIdDaCharNo(otomo.charNo),
    subskill: [...(otomo.initialSubskills ?? [])],
    attack: 1,
    defense: 1,
    hp: 1,
    level: 1,
  };
}
