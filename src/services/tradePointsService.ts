/*
 * Trade Points (P): the currency the Trading Post spends.
 *
 * The game has a real currency for this -- its own UI strings say "Trade Points",
 * "Trade Points Owned: ", "1 Time: %dP" and "Exchange at the Trading Post" -- and
 * every shop row carries `mst_event_point_id`, the id of the point it is priced
 * in. The server shipped with that balance pinned to 0 and priced everything in
 * zeny instead, so the currency could never be earned.
 *
 * WHERE THEY COME FROM
 * Only the daily allowance. The game's strings never say how P was originally
 * earned, and there is no trade-in route, so the allowance is the whole economy.
 * The allowance is handed out as a gift in the present box, not credited
 * directly -- see services/presenteGiornalieroService.ts.
 *
 * THE ALLOWANCE
 * Granted once per game day. The day rolls over at 05:00, not midnight, which is
 * what the game's own daily counters do (its login-bonus text says the count
 * resets at 5). Anything earlier in the morning therefore still belongs to
 * yesterday's allowance.
 *
 * Prices and the allowance are set in one place, below, so the economy is
 * tunable without touching logic.
 */
/**
 * The three point currencies, from `event_point_define` in
 * tools-js/rsdnt_property.arc. The shop has three tabs and each is priced in
 * its own currency -- the numbering (9001/9002/9003) lines up with the three
 * `mst_shop_id`s 1/2/3.
 *
 *   EVENTPOINT9001001 -> "Trade Point"        (yellow)
 *   EVENTPOINT9002001 -> "Superior Transaction P" (blue)
 *   EVENTPOINT9003001 -> "Special Deal P"     (silver)
 *
 * They used to be all hardcoded to the first one, so the three tabs displayed
 * the same balance and spending in one moved all three.
 */
export const PUNTI_ID = {
  base: 3190222199,
  superiore: 2895331993,
  speciale: 338634236,
} as const;

/** The currency a shop tier is priced in. */
export const PUNTI_PER_TIER: Record<number, number> = {
  1: PUNTI_ID.base,
  2: PUNTI_ID.superiore,
  3: PUNTI_ID.speciale,
};

/** The point id the Trading Post is priced in, as sent in every shop row. */
export const TRADE_POINT_ID = PUNTI_ID.base;

/*
 * Punti evento dell'evento 狩猟祭 (Hunter Fest): "Hunt Fest Flag P", id
 * EVENTPOINT7001001 (verificato in rsdnt_property.arc :: item_event_point).
 * Non e' una delle tre valute del Trading Post: e' la valuta dell'event shop
 * (event/shop/list e event/shop/buy), e i giocatori la guadagnano a fine
 * missione sulle isole (vedi questIsland.controller.ts).
 */
export const HUNT_FEST_POINT_ID = 3994654250;

/**
 * Daily allowance, in P. With the price table below this buys a generous stack
 * of anything: 1000 of the cheapest material, or 20 of the rarest (50 P each),
 * so a single day's allowance more than covers a full rarity 8 weapon upgrade.
 */
export const PUNTI_GIORNALIERI = Number(process.env.TRADE_POINTS_DAILY ?? 1000);

/**
 * Trade Points paid at the end of a quest (island / eternal / event). This is
 * the evergreen way to earn them: hunt, get paid, spend at the Trading Post.
 * 0 disables the payout. Env: QUEST_TRADE_POINTS.
 */
export const PUNTI_PER_QUEST = Number(process.env.QUEST_TRADE_POINTS ?? 100) || 0;

/**
 * Trade Points granted by /quest/reward/exchange (the end-of-quest reward
 * exchange). Its original semantics are not fully known, so this is opt-in and
 * guarded to once per game day; 0 (the default) leaves the route in log-only
 * mode. Env: QUEST_EXCHANGE_POINTS.
 */
export const PUNTI_PER_RISCATTO = Number(process.env.QUEST_EXCHANGE_POINTS ?? 0) || 0;

/** Hour the game day turns over, local time. Matches the game's own counters. */
const ORA_RESET = Number(process.env.TRADE_POINTS_RESET_HOUR ?? 5);

/**
 * Price of one unit, by material rarity. Rarity is real data
 * (src/json/materiali.json, from the game's item sheet), so the curve is
 * anchored to it rather than to row order. Rarity 8 is the top of the game and
 * caps the shelf at 50 P.
 */
const PREZZO_PER_RARITA: Record<number, number> = {
  1: 1,
  2: 2,
  3: 3,
  4: 5,
  5: 10,
  6: 20,
  7: 35,
  8: 50,
};

/** What one unit of `rarita` costs. Unknown rarities fall back to the cheapest. */
export function prezzoPerRarita(rarita: number): number {
  return PREZZO_PER_RARITA[rarita] ?? PREZZO_PER_RARITA[1]!;
}

/**
 * The game day a timestamp belongs to, as `YYYYMMDD`.
 *
 * Rolls over at ORA_RESET: 04:59 is still yesterday, 05:00 is today.
 */
export function giornoGioco(quando: Date): number {
  const d = new Date(quando.getTime());
  if (d.getHours() < ORA_RESET) d.setDate(d.getDate() - 1);
  return Number(
    `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`,
  );
}

interface Punto {
  mst_event_point_id?: number | null;
  amount?: number | null;
}
interface Box {
  points?: Punto[] | null;
}

/** How many P the player holds. Missing rows read as 0, never as NaN. */
export function saldoPunti(box: Box | null | undefined, puntoId: number = TRADE_POINT_ID): number {
  const riga = (box?.points ?? []).find((p) => Number(p?.mst_event_point_id) === puntoId);
  const n = Number(riga?.amount ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/** One row per point currency, in the order the three shop tabs use. */
export function saldiPunti(box: Box | null | undefined): { mst_event_point_id: number; amount: number }[] {
  return [PUNTI_ID.base, PUNTI_ID.superiore, PUNTI_ID.speciale].map((id) => ({
    mst_event_point_id: id,
    amount: saldoPunti(box, id),
  }));
}

/**
 * Adds `quantita` P to the currency's row, creating the row when missing, and
 * returns the new balance. Used when the shop buys items *from* the player, or
 * when quests pay out -- anywhere the client cannot do it itself (a save() of a
 * nested array element is not enough, see the note above).
 */
export function aggiungiPunti(
  box: Box,
  quantita: number,
  puntoId: number = TRADE_POINT_ID,
): number {
  const punti = (box.points ??= []);
  let riga = punti.find((p) => Number(p?.mst_event_point_id) === puntoId);
  if (!riga) {
    riga = { mst_event_point_id: puntoId, amount: 0 };
    punti.push(riga);
  }
  riga.amount = (Number(riga.amount ?? 0) || 0) + quantita;
  return riga.amount;
}

/** The client's price table, for logging and tests. */
/**
 * How much of each item the post stocks in total, and how much one player may
 * take. The client shows `shop_limit` as "Remaining" and `item_limit` as the
 * player's own allowance -- and it treats item_limit 0 as "already exchanged"
 * (uGUIMenuExchange::isItemExchanged is `item[28] == 0`).
 */
export const SCORTA_TOTALE = Number(process.env.TRADE_SHOP_STOCK ?? 99);
export const PER_GIOCOATORE = Number(process.env.TRADE_SHOP_PER_PLAYER ?? 99);

/** Game day key -> how much of each item was taken. See models/user.ts. */
/** What the player has already taken, for one item. */
export function giaAcquistato(doc: unknown, mstShopItemId: number): number {
  const grezzo = (doc as { negozi_acquistati?: Record<string, unknown> })?.negozi_acquistati;
  const voce = grezzo?.[giornoGioco(new Date())];
  return Number((voce as Record<string, number> | undefined)?.[String(mstShopItemId)] ?? 0) || 0;
}

/**
 * Records `quanti` bought and returns the new per-player total for that item.
 *
 * The whole day's purchases live under one key, so the reset at ORA_RESET clears
 * them without any scheduler: yesterday's key stops being read and the next
 * write starts a fresh map. Same trick as the allowance.
 */
export function registraAcquisto(doc: unknown, mstShopItemId: number, quanti: number): number {
  const d = doc as {
    punti_ultimo_giorno?: number | null;
    negozi_acquistati?: Record<string, Record<string, number>>;
    markModified?: (path: string) => void;
  };
  const oggi = giornoGioco(new Date());
  const mercato = (d.negozi_acquistati ??= {});
  const voce = (mercato[oggi] ??= {});
  const totale = (Number(voce[String(mstShopItemId)] ?? 0) || 0) + quanti;
  voce[String(mstShopItemId)] = totale;
  d.markModified?.('negozi_acquistati');
  return totale;
}

/**
 * Records the purchase with an explicit dotted write.
 *
 * Same reason as the dotted writes in shop.controller: editing a nested object
 * in place does not mark it dirty, so save() would drop it.
 */
export async function registraAcquistoAsync(doc: unknown, mstShopItemId: number, quanti: number): Promise<void> {
  const d = doc as {
    negozi_acquistati?: Record<string, Record<string, number>>;
    updateOne?: (u: Record<string, unknown>) => Promise<unknown>;
    save?: () => Promise<unknown>;
  };
  const totale = registraAcquisto(doc, mstShopItemId, quanti);
  if (typeof d.updateOne === 'function') {
    await d.updateOne({
      $set: { [`negozi_acquistati.${giornoGioco(new Date())}.${mstShopItemId}`]: totale },
    });
    return;
  }
  await d.save?.();
}

/** The client's price table, for logging and tests. */
export function tabellaPrezzi(): Record<number, number> {
  return { ...PREZZO_PER_RARITA };
}