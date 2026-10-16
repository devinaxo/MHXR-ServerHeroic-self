/*
 * Quest clear time: the two units do not match.
 *
 * The client sends the clear time in the "end" request in MILLISECONDS (its
 * in-quest timer is a float of seconds, x1000), and we store that verbatim. But
 * the quest *list* renders `clear_time` as SECONDS (mm:ss, and it caps the
 * minutes at 99). Handing back 105702 -- about 1:45 -- therefore overflowed and
 * every cleared quest read "99:59".
 *
 * Convert to seconds when putting it back in a list. `LEGGI_MS` can be set to 0
 * if the client ever turns out to want the raw value.
 */
const LEGGI_MS = process.env.QUEST_TIME_ALREADY_SECONDS !== '1';

export function tempoPerLista(clearTimeGrezzo: number | null | undefined): number {
  const t = Number(clearTimeGrezzo) || 0;
  if (t <= 0) return 0;
  return LEGGI_MS ? Math.floor(t / 1000) : t;
}
