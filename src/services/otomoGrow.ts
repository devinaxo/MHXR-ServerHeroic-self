/*
 * Crescita dei PALICO (otomo).
 *
 * A differenza dei partner, il livello di un palico NON e' un campo mandato dal
 * server: il client lo ricava da `exp` con `sOtomo::getLevelFromExp` e la stessa
 * tabella che usiamo qui. Quindi l'unica cosa che il server deve tenere e'
 * `box.otomos[].exp` (l'exp TOTALE cumulato) e, quando serve, la lista delle
 * skill imparate (`subskill[]`).
 *
 * Le tabelle arrivano dal gioco (src/json/otomo-grow.json e otomo-skills.json,
 * generati da tools-js/build-otomo-tables.cjs su rsdnt_otomo.arc). In
 * `otomo-grow.json` `expByLevel[i]` e' l'exp TOTALE per essere al livello i+1.
 */
import grow from '../json/otomo-grow.json' with { type: 'json' };
import skillTable from '../json/otomo-skills.json' with { type: 'json' };

interface TabellaOtomo {
  maxLevel: number;
  expByLevel: number[];
}

const PER_OTOMO = (grow as { byOtomo: Record<string, TabellaOtomo> }).byOtomo;

/** La skill "vuota" del client (`OT_SKL_SUB_NONE`), mai da insegnare. */
export const OTOMO_NO_SKILL = 2006012238;

/** Tutte le subskill vere (la prima riga della tabella e' "No Skill"). */
export const OTOMO_SKILL_POOL: ReadonlyArray<number> = (
  skillTable as { skills: { id: number; name: string }[] }
).skills
  .filter((s) => s.id !== OTOMO_NO_SKILL)
  .map((s) => s.id);

export function tabellaOtomo(mstOtomoId: number | null | undefined): TabellaOtomo | undefined {
  return PER_OTOMO[String(Number(mstOtomoId) || 0)];
}

/** Livello per l'exp TOTALE indicata (1 se il palico non e' in tabella). */
export function livelloPerExpOtomo(expTotale: number, mstOtomoId: number | null | undefined): number {
  const t = tabellaOtomo(mstOtomoId);
  if (!t) return 1;
  const exp = Math.max(0, Number(expTotale) || 0);
  let l = 1;
  while (l < t.maxLevel && t.expByLevel[l]! <= exp) l++;
  return l;
}

/** Exp totale per essere al livello `level` (1-based). */
export function expAlLivelloOtomo(level: number, mstOtomoId: number | null | undefined): number {
  const t = tabellaOtomo(mstOtomoId);
  if (!t) return 0;
  const l = Math.max(1, Math.min(t.maxLevel, Math.floor(level) || 1));
  return t.expByLevel[l - 1] ?? 0;
}

/** Exp che manca dal livello `level` a quello successivo (0 all'ultimo). */
export function expAlProssimoLivelloOtomo(level: number, mstOtomoId: number | null | undefined): number {
  const t = tabellaOtomo(mstOtomoId);
  if (!t || level >= t.maxLevel) return 0;
  return (t.expByLevel[level] ?? 0) - (t.expByLevel[level - 1] ?? 0);
}

export function maxLivelloOtomo(mstOtomoId: number | null | undefined): number {
  return tabellaOtomo(mstOtomoId)?.maxLevel ?? 1;
}

/**
 * Quanti subskill tiene il palico a questo livello. Letto dal client
 * (`cOtomoWSData::calcSkillSubSlotNum`): 0 sotto il 10, poi 1/2/3 agli
 * sblocchi di livello 10, 25 e 75.
 */
export function slotSubSkillOtomo(level: number): number {
  const l = Math.max(1, Math.floor(level) || 1);
  if (l < 10) return 0;
  if (l < 25) return 1;
  if (l < 75) return 2;
  return 3;
}

/** Livelli in cui si apre uno slot subskill: 10, 25, 75. */
export const LIVELLI_SLOT_OTOMO: ReadonlyArray<number> = [10, 25, 75];

export interface StatoOtomo {
  mst_otomo_id?: number | null;
  exp?: number | null;
  subskill?: number[] | null;
}

export interface EsitoCrescitaOtomo {
  level: number;
  exp: number;
  livelloPrecedente: number;
  /** true se l'exp ha fatto salire di livello. */
  salito: boolean;
  /** Quante subskill puo' tenere ora. */
  slot: number;
}

/** Applica `guadagno` exp a un palico e restituisce i nuovi livelli. */
export function applicaExpOtomo(stato: StatoOtomo, guadagno: number): EsitoCrescitaOtomo {
  const id = Number(stato.mst_otomo_id) || 0;
  const livelloPrecedente = livelloPerExpOtomo(stato.exp ?? 0, id);
  const t = tabellaOtomo(id);
  const maxExp = t ? (t.expByLevel[t.maxLevel - 1] ?? 0) : Number.MAX_SAFE_INTEGER;
  const exp = Math.min(maxExp, Math.max(0, Number(stato.exp) || 0) + Math.max(0, Math.floor(guadagno) || 0));
  const level = livelloPerExpOtomo(exp, id);
  return {
    level,
    exp,
    livelloPrecedente,
    salito: level > livelloPrecedente,
    slot: slotSubSkillOtomo(level),
  };
}

/**
 * La subskill da insegnare al palico quando passa da `livelloPrecedente` a
 * `livelloNuovo`, oppure null se non c'e' niente da imparare (o lo slot e' gia'
 * pieno). La scelta non esiste nel master: il gioco la decideva lato server.
 * Qui e' deterministica per (palico, slot) pescando dalla tabella vera e
 * saltando quelle che il palico conosce gia'.
 */
export function skillDaImparareOtomo(
  mstOtomoId: number | null | undefined,
  livelloNuovo: number,
  subskillGia: ReadonlyArray<number> = [],
): number | null {
  // Uno slot per ogni soglia di livello superata (10 / 25 / 75).
  const dovute = slotSubSkillOtomo(livelloNuovo);
  if (subskillGia.filter((s) => s && s !== OTOMO_NO_SKILL).length >= dovute) return null;
  if (OTOMO_SKILL_POOL.length === 0) return null;

  const id = Number(mstOtomoId) || 0;
  const conosciute = new Set(subskillGia.filter((s) => s && s !== OTOMO_NO_SKILL));
  const start = (Math.abs(id) + (subskillGia.length + 1) * 97) % OTOMO_SKILL_POOL.length;
  for (let i = 0; i < OTOMO_SKILL_POOL.length; i++) {
    const cand = OTOMO_SKILL_POOL[(start + i) % OTOMO_SKILL_POOL.length]!;
    if (!conosciute.has(cand)) return cand;
  }
  return null;
}

/** Le subskill "vere" di un palico, senza il segnaposto "No Skill". */
export function subSkillValideOtomo(subskill: ReadonlyArray<number> | null | undefined): number[] {
  return (subskill ?? []).filter((s) => s && s !== OTOMO_NO_SKILL);
}
