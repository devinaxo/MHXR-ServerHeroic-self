/*
 * Intervalli numerici configurabili da .env, per i premi casuali a fine quest.
 *
 * Una variabile puo' essere un valore fisso o un intervallo:
 *   QUEST_ZENY=500       -> sempre 500
 *   QUEST_ZENY=300-900   -> un intero casuale fra 300 e 900, diverso a ogni quest
 *
 * Cosi' il bilanciamento si cambia dal .env e un riavvio, senza ricompilare.
 * Variabile assente o scritta male: si usa il default passato dal chiamante.
 */

/** [min, max] letti da una variabile d'ambiente, o il default se assente/invalida. */
export function intervalloEnv(nome: string, predefinitoMin: number, predefinitoMax: number): [number, number] {
  const grezzo = process.env[nome]?.trim();
  if (!grezzo) return [predefinitoMin, predefinitoMax];
  const m = /^(\d+)\s*(?:-\s*(\d+))?$/.exec(grezzo);
  if (!m?.[1]) return [predefinitoMin, predefinitoMax];
  const a = Number(m[1]);
  const b = m[2] ? Number(m[2]) : a;
  return [Math.min(a, b), Math.max(a, b)];
}

/** Intero casuale fra min e max, estremi inclusi. */
export function interoCasuale(min: number, max: number): number {
  const a = Math.floor(min);
  const b = Math.floor(max);
  if (b <= a) return a;
  return a + Math.floor(Math.random() * (b - a + 1));
}
