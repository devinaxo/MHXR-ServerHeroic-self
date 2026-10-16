/*
 * Oggetti di crescita dei partner (item_partner_grow).
 *
 * Estratti da rsdnt_property.arc :: tuning\xml\item\item_partner_grow. Sono i
 * "Growth Shard" (100 exp) e "Growth Orb" (500 exp) di ogni partner, piu' una
 * versione "incolore" buona per chiunque. Gli id sono quelli veri del gioco:
 * il client li disegna con l'icona giusta e il menu del partner li accetta.
 *
 * Servono in due posti: la vetrina del bazaar (shop.controller) e le ricompense
 * delle quest (questIsland.controller).
 */
export interface VoceCrescitaPartner {
  id: number;
  titolo: string;
  exp: number;
  /** Partner this item is for; 0 = any partner ("Colorless"). */
  partnerId: number;
}

export const CRESCITA_PARTNER: ReadonlyArray<VoceCrescitaPartner> = [
  { id: 1436170315, titolo: 'Ciel Growth Shard', exp: 100, partnerId: 507850012 },
  { id: 3432212977, titolo: 'Elemya Growth Shard', exp: 100, partnerId: 2269936806 },
  { id: 3147061607, titolo: 'Racoris Growth Shard', exp: 100, partnerId: 4031466544 },
  { id: 636538052, titolo: 'Valt Growth Shard', exp: 100, partnerId: 1848629651 },
  { id: 1391983698, titolo: 'Berk Growth Shard', exp: 100, partnerId: 422111493 },
  { id: 3422465512, titolo: 'Colorless Growth Shard', exp: 100, partnerId: 0 },
  { id: 3170475390, titolo: 'Ciel Growth Orb', exp: 500, partnerId: 507850012 },
  { id: 742818031, titolo: 'Elemya Growth Orb', exp: 500, partnerId: 2269936806 },
  { id: 1531031673, titolo: 'Racoris Growth Orb', exp: 500, partnerId: 4031466544 },
  { id: 998652316, titolo: 'Valt Growth Orb', exp: 500, partnerId: 1848629651 },
  { id: 1283524874, titolo: 'Berk Growth Orb', exp: 500, partnerId: 422111493 },
  { id: 3582482608, titolo: 'Colorless Growth Orb', exp: 500, partnerId: 0 },
];

export const CRESCITA_PARTNER_IDS: ReadonlySet<number> = new Set(CRESCITA_PARTNER.map((g) => g.id));

/** Exp che un oggetto di crescita dei partner vale (0 se non e' uno di questi). */
export function expCrescitaPartner(id: number): number {
  return CRESCITA_PARTNER.find((g) => g.id === id)?.exp ?? 0;
}

/**
 * Per quale partner vale l'oggetto: 0 = "Colorless" (chiunque), altrimenti deve
 * combaciare con l'mst_partner_id del partner scelto. `null` = non e' un oggetto
 * di crescita dei partner.
 */
export function partnerDiCrescita(id: number): number | null {
  const g = CRESCITA_PARTNER.find((v) => v.id === id);
  return g ? g.partnerId : null;
}

/** true se l'oggetto si puo' dare al partner indicato (0 = incolore). */
export function crescitaPerPartner(id: number, mstPartnerId: number): boolean {
  const p = partnerDiCrescita(id);
  return p !== null && (p === 0 || p === Number(mstPartnerId));
}

/*
 * Curva di crescita (src/json/partner-grow.json, estratta da
 * rsdnt_player.arc :: partnerGrowTable). `expByLevel[i]` e' l'exp TOTALE
 * cumulato per essere al livello i+1; `caps` sono i tetti delle tre fasce
 * (20 / 30 / 50) che il limit break sblocca.
 */
import grow from '../json/partner-grow.json' with { type: 'json' };

const EXP_BY_LEVEL = (grow as { expByLevel: number[] }).expByLevel;
export const PARTNER_CAPS = (grow as { caps: number[] }).caps;

/** Exp totale cumulato per essere al livello `level` (1-based). */
export function expCumulata(level: number): number {
  const l = Math.max(1, Math.min(EXP_BY_LEVEL.length, Math.floor(level) || 1));
  return EXP_BY_LEVEL[l - 1]!;
}

/** Exp che manca dal livello `level` a quello successivo (0 all'ultimo). */
export function expAlLivelloDopo(level: number): number {
  const l = Math.max(1, Math.floor(level) || 1);
  return l >= EXP_BY_LEVEL.length ? 0 : EXP_BY_LEVEL[l]! - EXP_BY_LEVEL[l - 1]!;
}

/** Il livello piu' alto raggiungibile con `expTotale`, senza superare `cap`. */
export function livelloPerExp(expTotale: number, cap: number): number {
  const max = Math.min(cap, EXP_BY_LEVEL.length);
  let l = 1;
  while (l < max && EXP_BY_LEVEL[l]! <= expTotale) l++;
  return l;
}

export interface StatoCrescita {
  level?: number | null;
  exp?: number | null;
  exp_max?: number | null;
  level_cap_tier?: number | null;
  level_max?: number | null;
}

export interface EsitoCrescita {
  level: number;
  exp: number;
  exp_max: number;
  level_cap_tier: number;
  level_max: number;
  /** true se la crescita ha sbloccato una fascia (schermata "Level limit unlocked"). */
  limitBreak: boolean;
}

/**
 * Applica `guadagno` exp a un partner e restituisce i nuovi campi.
 *
 * `exp` e' l'exp TOTALE cumulato (non quello dentro il livello): e' quello che
 * il client legge e da cui ricava il livello con la stessa tabella. Se l'exp
 * supera il tetto della fascia corrente il limit break sale di una fascia, fino
 * alla terza (livello 50).
 */
export function applicaExpPartner(stato: StatoCrescita, guadagno: number): EsitoCrescita {
  let tier = Math.max(0, Math.min(PARTNER_CAPS.length - 1, Math.floor(Number(stato.level_cap_tier) || 0)));
  let expTotale = Math.max(0, Number(stato.exp) || 0) + Math.max(0, Math.floor(guadagno) || 0);
  let cap = PARTNER_CAPS[tier]!;
  let limitBreak = false;
  while (tier < PARTNER_CAPS.length - 1 && expTotale > expCumulata(PARTNER_CAPS[tier]!)) {
    tier += 1;
    cap = PARTNER_CAPS[tier]!;
    limitBreak = true;
  }
  const level = livelloPerExp(expTotale, cap);
  return {
    level,
    exp: expTotale,
    exp_max: expAlLivelloDopo(level),
    level_cap_tier: tier,
    level_max: cap,
    limitBreak,
  };
}
