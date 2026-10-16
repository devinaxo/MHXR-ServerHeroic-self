import { Request, Response } from 'express';
import { encryptAndSend } from '../../../services/crypto/encryptionHelpers.js';
import { ERROR_CODE, ERROR_CATEGORY } from '../../../constants/error.codes.js';
import { createLogger } from '../../../middleware/logger.js';
import User from '../../../model/user.js';
import materiali from '../../../json/materiali.json' with { type: 'json' };
import costiPotenziamento from '../../../json/upgrade-costs.json' with { type: 'json' };
import {
  PER_GIOCOATORE,
  PUNTI_GIORNALIERI,
  PUNTI_PER_TIER,
  SCORTA_TOTALE,
  TRADE_POINT_ID,
  giaAcquistato,
  prezzoPerRarita,
  registraAcquistoAsync,
  saldiPunti,
  saldoPunti,
} from '../../../services/tradePointsService.js';
import { consegnaPresenteGiornalieroAsync } from '../../../services/presenteGiornalieroService.js';
import type { ShopBuyInput } from './shop.schema.js';
import type { SessionOnlyInput } from '../../../schemas/common.schema.js';
import { spendiKaridama } from '../../../services/karidamaService.js';
import { saldiPayments, paymentsDaSalvare } from '../../../services/paymentService.js';
import { CRESCITA_PARTNER } from '../../../services/partnerGrow.js';

const log = createLogger('shop');

/*
 * NEGOZIO A 1 ZENY.
 *
 * Vende tutti i 4878 materiali del gioco a 1 zeny l'uno. Gli id vengono da
 * src/json/materiali.json, costruito dal foglio degli oggetti e gia' usato dal
 * server per filtrare le ricompense: nessun id inventato.
 *
 * PERCHE' SOLO MATERIALI: il crash del login di agosto era causato da due cose,
 * un equipaggiamento scritto in box con 15 campi invece di 16, e un id che non
 * era un materiale finito in box.materials. Qui non si tocca box.equipments e
 * si accetta solo cio' che sta nella tabella verificata, quindi nessuna delle
 * due puo' ripetersi.
 *
 * COSA NON SI TOCCA: le funzioni info(), karidamaInfo() e karidamaList() restano
 * esattamente le originali di upstream. /api/shop/info viene chiamata DURANTE
 * IL LOGIN — modificarne i campi e' gia' costato un login rotto una volta.
 * /api/shop/list e /api/shop/buy invece il client le chiama solo quando apre
 * davvero il negozio, quindi un errore li' rompe il negozio, non l'ingresso.
 */

interface VoceMateriale {
  id: number;
  /** Japanese name, as the game stores it. */
  nome: string;
  /** English name from the same item sheet. Every row has one. */
  en?: string;
  rarita: number;
}

const CATALOGO = materiali as ReadonlyArray<VoceMateriale>;
const PER_ID = new Map<number, VoceMateriale>(CATALOGO.map((m) => [m.id, m]));

/*
 * MATERIALI CHE DEVONO ESSERCI SEMPRE IN VETRINA.
 *
 * Il gioco ha 4878 materiali ma il negozio ne mostra un campione (MAX_VOCI per
 * scheda): cosi' la risposta resta leggera. Il problema e' che certi materiali
 * si ottengono SOLO da ricompense di quest evento che non vengono piu' erogate
 * (le pergamene "Subjugation" delle lune, i Flower Ore, e molti pezzi richiesti
 * dai potenziamenti): chi li deve usare resta bloccato.
 *
 * Per non bloccare mai un potenziamento, oltre al campione si aggiungono sempre:
 *   - ogni materiale citato dai set di potenziamento (src/json/upgrade-costs.json);
 *   - i materiali "di evento" (pergamene Subjugation e Flower Ore), cosi'
 *     restano comprabili anche a evento spento.
 * Gli id vengono sempre da materiali.json, quindi niente id inventati.
 */
const MATERIALI_UPGRADE = new Set<number>(
  Object.values(
    (costiPotenziamento as { materialSets?: Record<string, { mst_material_id: number }[]> }).materialSets ?? {},
  )
    .flat()
    .map((m) => m.mst_material_id),
);
const MATERIALI_EVENTO = new Set<number>(
  CATALOGO.filter((m) => /Subjugation|Flower Ore/.test(m.en ?? m.nome ?? '')).map((m) => m.id),
);
const SEMPRE_IN_VETRINA = new Set<number>([...MATERIALI_UPGRADE, ...MATERIALI_EVENTO]);

const MAX_PER_ACQUISTO = 99; // tetto di sicurezza: evita che un amount assurdo
                             // (o malformato) crei quantita' fuori scala in box

/*
 * QUANTI OGGETTI METTERE IN VETRINA — e perche' non tutti e 4878.
 *
 * Il catalogo intero, replicato nei tre scaffali che il client conosce, produce
 * una risposta di 4,9 MB (misurata). Cifrata diventa anche di piu'. Su un gioco
 * per telefono e' quasi certo che significhi timeout, memoria esaurita o
 * interfaccia bloccata — e sarebbe un guaio scoprirlo col negozio che non si
 * apre piu'.
 *
 * Si parte da un numero prudente e si sale a scalini verificando in gioco,
 * esattamente come si e' fatto per l'equipaggiamento (5 per categoria, poi 25,
 * poi 100). Con 300 voci la risposta sta sotto il megabyte.
 *
 * Per alzarlo: cambiare SHOP_MAX_VOCI nel .env (non serve ricompilare il
 * codice, solo riavviare), oppure mettere 0 per togliere del tutto il limite.
 */
const MAX_VOCI = (() => {
  const v = Number(process.env.SHOP_MAX_VOCI);
  return Number.isFinite(v) && v >= 0 ? v : 300;
})();

/*
 * La selezione, quando c'e' un tetto: campione distribuito su TUTTE le rarita'
 * invece dei primi N di fila. Prendendo i primi si avrebbero solo gli oggetti
 * di inizio tabella (monete di rame e poco altro); cosi' invece si trova roba
 * di ogni livello, che e' quello che serve per potenziare.
 */
function campiona(lista: ReadonlyArray<VoceMateriale>, tetto: number): VoceMateriale[] {
  if (!tetto || tetto >= lista.length) return [...lista];
  const perRarita = new Map<number, VoceMateriale[]>();
  for (const m of lista) {
    if (!perRarita.has(m.rarita)) perRarita.set(m.rarita, []);
    perRarita.get(m.rarita)!.push(m);
  }
  const quota = Math.max(1, Math.floor(tetto / perRarita.size));
  const scelti: VoceMateriale[] = [];
  for (const [, gruppo] of [...perRarita.entries()].sort((a, b) => a[0] - b[0])) {
    const quanti = Math.min(quota, gruppo.length);
    const passo = gruppo.length / quanti;
    for (let i = 0; i < quanti; i++) scelti.push(gruppo[Math.min(gruppo.length - 1, Math.floor(i * passo))]!);
  }
  return scelti;
}

/*
 * LE TRE SCHEDE ORA VENDONO MERCE DIVERSA.
 *
 * Ogni scheda (= mst_shop_id) ha la sua valuta: 1 = Trade Point, 2 = Superior
 * Transaction P, 3 = Special Deal P. Prima riempivano tutte lo stesso elenco,
 * quindi qualunque valuta comprava le stesse cose. Adesso la rarita' cresce con
 * la valuta: i materiali comuni (★1-3) si pagano in Trade Point, i medi (★4-6)
 * in Superior, i rari (★7-8) in Special Deal. Le schegge/sfere di crescita dei
 * partner (vedi sotto) stanno nella scheda piu' rara.
 */
const RARITA_PER_TIER: Record<number, number[]> = { 1: [1, 2, 3], 2: [4, 5, 6], 3: [7, 8] };

/*
 * OGGETTI DI CRESCITA DEI PARTNER: vedi services/partnerGrow.ts. Stanno nella
 * scheda piu' rara (Special Deal P). Le sfere costano 50, le schegge 25, e ne
 * stoccano 99 al giorno (lo stock si rinnova alle 5 come tutto il resto).
 */
const PREZZO_CRESCITA: Record<number, number> = { 100: 25, 500: 50 };

/** Una riga di qualsiasi scaffale: materiale o oggetto di crescita. */
interface RigaVetrina {
  id: number;
  titolo: string;
  rarita: number;
  prezzo: number;
  /** Quante ne puo' prendere UN giocatore al giorno (item_limit del client). */
  limite: number;
  /** Quante ne ha in tutto il negozio (shop_limit del client). */
  scorta: number;
  /** Quale array della box riceve l'oggetto comprato. */
  famiglia: 'materials' | 'growth_items';
  /** Il corpo che il client legge in item_contents / disp_item_contents. */
  contenuto: Record<string, unknown>;
}

/** Stock speciale per gli oggetti di crescita dei partner. */
const SCORTA_CRESCITA = 99;
const LIMITE_CRESCITA = 99;

/*
 * MATERIALI DI POTENZIAMENTO. I potenziamenti oltre un certo livello chiedono
 * 強化材 / 強化印籠 (Enhancement Material / Inro). Nel gioco arrivano solo dalle
 * quest evento/ticket; qui li teniamo SEMPRE in vetrina, TUTTI INSIEME sulla
 * scheda piu' rara, cosi' si trovano subito e gli upgrade restano fattibili.
 */
const MATERIALI_POTENZIAMENTO: ReadonlyArray<number> = [
  1921761827, // Enhancement Material (r3)
  34463248, // Support-Use Reinforced Fiber (r3)
  4243365568, // Enhancement Inro [Purple] (r4)
  2347478614, // Enhancement Inro [Yellow] (r4)
  316866540, // Enhancement Inro [Azure] (r4)
  1709559674, // Enhancement Inro [Crimson] (r4)
  3671903689, // Enhancement Poster (r4)
];

function rigaMateriale(m: VoceMateriale): RigaVetrina {
  return {
    id: m.id,
    titolo: m.en?.trim() || m.nome,
    rarita: m.rarita,
    prezzo: prezzoPerRarita(m.rarita),
    limite: PER_GIOCOATORE,
    scorta: SCORTA_TOTALE,
    famiglia: 'materials',
    contenuto: { materials: [{ amount: 1, mst_material_id: m.id }] },
  };
}

const SCAFFALE_POTENZIAMENTO: RigaVetrina[] = MATERIALI_POTENZIAMENTO
  .map((id) => PER_ID.get(id))
  .filter((m): m is VoceMateriale => !!m)
  .map(rigaMateriale);

function scaffaleMateriali(tier: number): RigaVetrina[] {
  const rarita = RARITA_PER_TIER[tier]!;
  const pool = CATALOGO.filter((m) => rarita.includes(m.rarita));
  // Il campione distribuito, piu' i materiali che devono esserci comunque
  // (potenziamenti e oggetti di evento). La Map deduplica per id.
  const scelti = new Map<number, VoceMateriale>();
  for (const m of campiona(pool, MAX_VOCI)) scelti.set(m.id, m);
  for (const m of pool) if (SEMPRE_IN_VETRINA.has(m.id)) scelti.set(m.id, m);
  return [...scelti.values()].map(rigaMateriale);
}

const SCAFFALE_CRESCITA: RigaVetrina[] = CRESCITA_PARTNER.map((g) => ({
  id: g.id,
  titolo: g.titolo,
  rarita: g.exp >= 500 ? 2 : 1,
  prezzo: PREZZO_CRESCITA[g.exp] ?? 50,
  limite: LIMITE_CRESCITA,
  scorta: SCORTA_CRESCITA,
  famiglia: 'growth_items' as const,
  contenuto: { growth_items: [{ amount: 1, mst_growth_item_id: g.id }] },
}));

/** scaffale per mst_shop_id: 1 = Trade Point, 2 = Superior, 3 = Special Deal. */
const SCAFFALI: Record<number, RigaVetrina[]> = {
  1: scaffaleMateriali(1),
  2: scaffaleMateriali(2),
  // La scheda piu' rara raggruppa TUTTO il resto: materiali ★7-8, le schegge/
  // sfere dei partner e i materiali di potenziamento (Enhancement), cosi' si
  // trovano in un posto solo.
  3: [...scaffaleMateriali(3), ...SCAFFALE_CRESCITA, ...SCAFFALE_POTENZIAMENTO],
};

const RIGA_PER_ID = new Map<number, RigaVetrina>(Object.values(SCAFFALI).flat().map((r) => [r.id, r]));

/** Una riga del negozio, nella forma che il client si aspetta. */
function vetrina(r: RigaVetrina, giaPresi = 0) {
  return {
    detail: r.titolo,
    disp_item_contents: r.contenuto,
    end_remain: 30000,
    // il combobox del negozio filtra su questo campo: una categoria sola
    filter_type: 0,
    item_contents: r.contenuto,
    /*
     * The two counters are NOT what their names suggest. Read out of the client:
     *
     *   uGUIMenuExchange::isItemExchanged(i)
     *       item = getLineupDispItem(i);  return item[28] == 0;
     *   uGUIMenuExchange::isEnableExchange(i)
     *       if (item[28] == 0) return false;      // not exchangeable
     *       if (item[80] <= now) return false;   // expired (absolute time)
     *       return item[68] <= parent[588];       // price <= points owned
     *
     * So the flag at +28 is inverted from the field name: ZERO means "already
     * exchanged". It was 0 on every row, which is why the post showed the
     * EXCHANGED badge over everything and nothing could be clicked.
     *
     *   item_limit -- how many this player may still take. Allowed to reach 0,
     *                  which is exactly when the client greys the row out and
     *                  badges it EXCHANGED.
     *   shop_limit -- stock left, which is what the "sold out" wording is;
     *                  floored at 1 so it only appears when genuinely out of
     *                  stock, not merely used up by this one player
     *
     * Both come down with every purchase and come back by themselves at the
     * 05:00 rollover, because the purchase counts are keyed by game day.
     *
     * An earlier revision floored item_limit at 1 as well. That was wrong: an
     * exhausted item still looked buyable, and the purchase then failed at the
     * server instead of being refused cleanly by the client.
     */
    item_limit: Math.max(0, r.limite - giaPresi),
    item_limit_max: r.limite,
    mst_shop_item_id: r.id,
    name: r.titolo,
    // Priced in the tab's own points, which is what mst_event_point_id names.
    price: r.prezzo,
    shop_limit: Math.max(1, r.scorta - giaPresi),
    shop_limit_max: r.scorta,
    start_remain: 0,
  };
}

/*
 * KARIDAMA SHOP (shop/karidama/*).
 *
 * The Trading Post's sibling: it spends 狩玉 (Hunter Coins) instead of Trade
 * Points. It used to answer with a literal stub -- one row named "name" and a
 * category called "test name", both unclickable -- so the exchange screen just
 * said "Please select the item you want to exchange" with nothing to pick.
 *
 * Contract read from the client:
 *   list req  { mst_karidama_shop_id }
 *   list resp { karidama_shop_items[], type_list[], mst_karidama_shop_id }
 *   buy  req  { amount, mst_karidama_shop_id, mst_shop_item_id }
 *   buy  resp { item_contents, payments }    (sServer copies item_contents into
 *                                             the box and replaces the balances)
 */
const KARIDAMA_SHOP_ID = 1;

// Real materials from src/json/materiali.json, priced in Hunter Coins. A small
// curated shelf of the high-rarity monster parts players actually grind for.
const KARIDAMA_SHOP: { id: number; prezzo: number }[] = [
  { id: 1183126671, prezzo: 10 }, // rarity 6, Flame Divine Vein
  { id: 3750511925, prezzo: 10 }, // rarity 6, Aqua Divine Vein
  { id: 3638657324, prezzo: 20 }, // rarity 7, Flame Divine Palm
  { id: 2951131578, prezzo: 20 }, // rarity 7, Aqua Divine Palm
  { id: 1839744844, prezzo: 40 }, // rarity 8, Flame Divine Eye
  { id: 4104197878, prezzo: 40 }, // rarity 8, Aqua Divine Eye
];

function rigaKaridama(stato: { id: number; prezzo: number }) {
  const m = PER_ID.get(stato.id);
  const titolo = m?.en?.trim() || m?.nome || `Item ${stato.id}`;
  return {
    detail: `${titolo} — costs ${stato.prezzo} Hunter Coins`,
    disp_item_contents: { materials: [{ amount: 1, mst_material_id: stato.id }] },
    end_remain: 30000,
    flag_mst_shop_item_id: 0,
    item_contents: { materials: [{ amount: 1, mst_material_id: stato.id }] },
    item_limit: 99,
    item_limit_max: 99,
    mst_shop_item_id: stato.id,
    name: titolo,
    price: stato.prezzo,
    shop_limit: 99,
    shop_limit_max: 99,
    shop_type: 0,
    start_remain: 0,
  };
}

export const karidamaInfo = (req: Request, res: Response) => {
  const data = {
    karidama_shop_infos: [
      {
        end_remain: 36000,
        mst_karidama_shop_id: KARIDAMA_SHOP_ID,
        name: 'Hunter Coin Exchange',
        start_remain: 0,
      },
    ],
  };
  encryptAndSend(data, res, req);
};

export const karidamaList = (req: Request, res: Response) => {
  // The shelf is fixed, so the rows never need a DB read: only the buy does.
  const data = {
    karidama_shop_items: KARIDAMA_SHOP.map(rigaKaridama),
    mst_karidama_shop_id: KARIDAMA_SHOP_ID,
    type_list: [{ name: 'Exchange', type: 0 }],
  };
  encryptAndSend(data, res, req);
};

export const karidamaBuy = async (req: Request, res: Response) => {
  try {
    const { session_id, mst_shop_item_id, amount } = req.body as {
      session_id?: string;
      mst_shop_item_id?: unknown;
      amount?: unknown;
    };
    const doc = session_id ? await User.findOne({ current_session: session_id }) : null;
    if (!doc?.box) {
      return encryptAndSend({}, res, req, ERROR_CODE.NOT_AUTHENTICATED);
    }

    const stato = KARIDAMA_SHOP.find((s) => s.id === Number(mst_shop_item_id));
    if (!stato) {
      return encryptAndSend({}, res, req, ERROR_CODE.GENERIC_ERROR, ERROR_CATEGORY.ERROR_DIALOG, 'Item not available');
    }

    const quanti = Math.max(1, Math.min(99, Number(amount) || 1));
    const costo = stato.prezzo * quanti;

    const box = doc.box as unknown as {
      payments?: { mst_payment_id?: number | null; amount?: number | null }[];
      materials?: { mst_material_id?: number | null; amount?: number | null }[];
    };
    if (!spendiKaridama(box, costo)) {
      return encryptAndSend(
        { item_contents: {}, payments: saldiPayments(box.payments) },
        res, req, ERROR_CODE.ZENY_NOT_ENOUGH, ERROR_CATEGORY.ERROR_DIALOG,
        `Not enough Hunter Coins: need ${costo}`,
      );
    }

    if (!box.materials) box.materials = [];
    const esistente = box.materials.find((m) => Number(m?.mst_material_id) === stato.id);
    if (esistente) esistente.amount = Number(esistente.amount ?? 0) + quanti;
    else box.materials.push({ mst_material_id: stato.id, amount: quanti });

    await User.updateOne(
      { _id: doc._id },
      { $set: { 'box.payments': paymentsDaSalvare(box.payments), 'box.materials': box.materials } },
    );

    log.info('karidama shop | %s compra %d x %d per %d 狩玉', doc.character_name ?? '?', stato.id, quanti, costo);
    encryptAndSend(
      { item_contents: { materials: [{ amount: quanti, mst_material_id: stato.id }] }, payments: saldiPayments(box.payments) },
      res, req,
    );
  } catch (error) {
    log.error('Error in karidamaBuy:', error);
    encryptAndSend({}, res, req, ERROR_CODE.GENERIC_ERROR, ERROR_CATEGORY.ERROR_DIALOG, 'Karidama shop buy failed');
  }
};

/*
 * The three tabs of the Trading Post, each priced in its OWN currency.
 *
 * They used to all carry mst_event_point_id 3190222199, so the three tabs showed
 * the same balance and spending in one moved all three. The ids come from
 * `event_point_define` (tools-js/rsdnt_property.arc): EVENTPOINT9001001 /
 * 9002001 / 9003001, matching mst_shop_id 1 / 2 / 3.
 */
const scheda = (mstShopId: number, nome: string) => ({
  end_remain: 36000,
  mst_event_point_id: PUNTI_PER_TIER[mstShopId]!,
  mst_shop_id: mstShopId,
  name: nome,
  start_remain: 0,
});

export const info = (req: Request, res: Response) => {
  const data = {
    high_upper_shop_info: scheda(1, 'shop'),
    low_upper_shop_info: scheda(2, 'shop'),
    shop_infos: [scheda(3, 'shop')],
  };
  encryptAndSend(data, res, req);
};

/**
 * L'elenco del negozio: tutti i materiali del gioco, a 1 zeny l'uno.
 *
 * Il client la chiama solo quando il giocatore apre davvero il negozio, non al
 * login — quindi qui si puo' lavorare senza il rischio che ha morso ad agosto.
 */
export const list = async (req: Request, res: Response) => {
  // Opening the post is the most natural moment to hand out the day's gift: it
  // is a request the client makes every time the screen opens, and the same
  // service is called on login. It only creates the present once per game day.
  const { session_id } = req.body as SessionOnlyInput;
  const doc = await User.findOne({ current_session: session_id });
  let punti = 0;
  if (doc?.box) {
    await consegnaPresenteGiornalieroAsync(doc);
    punti = saldoPunti(doc.box as unknown as Parameters<typeof saldoPunti>[0]);
  }

  // Each card shows what is left of ITS OWN stock, so the count is per item.
  const vetrinaDi = (tier: number) => SCAFFALI[tier]!.map((r) => vetrina(r, giaAcquistato(doc, r.id)));
  const comune = vetrinaDi(1);
  const medio = vetrinaDi(2);
  const raro = vetrinaDi(3);
  /*
   * The client's tabs are crossed relative to these response keys: the normal
   * Trade Points tab actually reads `shop_items`, and the Special Deal tab reads
   * `high_upper_shop_items` (confirmed in game -- normal points were showing the
   * rarest goods). So the COMMON shelf goes on `shop_items` and the RARE shelf
   * (with the partner growth items) on `high_upper_shop_items`; the middle shelf
   * keeps its own key. Net result: normal points buy common goods, Special Deal
   * buys rare ones.
   */
  const data = {
    high_upper_shop_items: raro,
    low_upper_shop_items: medio,
    shop_items: comune,
    // Saldi: uno per valuta, cosi' le tre schede non leggono lo stesso numero.
    points: saldiPunti(doc?.box as Parameters<typeof saldiPunti>[0]),
  };
  log.info(
    'negozio aperto | comuni %d, medi %d, rari %d | saldo %d P (+%d/giorno)',
    comune.length, medio.length, raro.length, punti, PUNTI_GIORNALIERI,
  );
  encryptAndSend(data, res, req);
};

export const buy = async (req: Request, res: Response) => {
  try {
    const { session_id, amount, mst_shop_item_id } = req.body as ShopBuyInput;

    const doc = await User.findOne({ current_session: session_id });
    if (!doc) return encryptAndSend({}, res, req, ERROR_CODE.NOT_AUTHENTICATED);

    // Solo id che sono davvero in vetrina (materiali o oggetti di crescita dei
    // partner). Un id fuori catalogo scritto in box blocca il login in modo
    // permanente: e' gia' successo con 1277724242.
    const articolo = RIGA_PER_ID.get(Number(mst_shop_item_id));
    if (!articolo) {
      log.info('acquisto rifiutato: id %s non e\' in vetrina', String(mst_shop_item_id));
      return encryptAndSend({}, res, req, ERROR_CODE.GENERIC_ERROR, ERROR_CATEGORY.ERROR_DIALOG, 'Oggetto non disponibile');
    }

    const quanti = Math.max(1, Math.min(MAX_PER_ACQUISTO, Number(amount) || 1));
    const costo = articolo.prezzo * quanti;

    const box = doc.box as unknown as {
      points?: { amount?: number | null; mst_event_point_id?: number | null }[];
      materials?: { amount?: number | null; mst_material_id?: number | null }[];
      growth_items?: { amount?: number | null; mst_growth_item_id?: number | null }[];
    };
    if (!box) {
      return encryptAndSend({}, res, req, ERROR_CODE.GENERIC_ERROR, ERROR_CATEGORY.ERROR_DIALOG, 'Inventario assente');
    }

    /*
     * Trade Points live in box.points, keyed by mst_event_point_id -- not in
     * box.payments (that one is the special currencies, PAYMENT00001 and five
     * others) and not in box.zeny, which is a single number.
     */
    // Which currency is spent depends on the tab the purchase came from.
    // Resolved before the checks so every reply names the right one -- the
    // limit branch used to hardcode the base Trade Point, so a refusal on tab
    // 2/3 reported the wrong balance.
    const puntoId = PUNTI_PER_TIER[Number(req.body?.mst_shop_id) || 3] ?? TRADE_POINT_ID;

    // Per-player allowance, before anything is touched. Without this the cap is
    // only cosmetic: the client greys the row out but the server would still
    // serve it.
    const giaPresi = giaAcquistato(doc, articolo.id);
    if (giaPresi + quanti > articolo.limite) {
      log.info('acquisto rifiutato: %s gia %d/%d per %s', articolo.titolo, giaPresi, articolo.limite, doc.character_name ?? '?');
      return encryptAndSend(
        { point: { amount: saldoPunti(box as unknown as Parameters<typeof saldoPunti>[0], puntoId), mst_event_point_id: puntoId } },
        res, req, ERROR_CODE.ITEMS_NOT_ENOUGH, ERROR_CATEGORY.ERROR_DIALOG,
        `Daily limit reached for ${articolo.titolo}: ${giaPresi}/${articolo.limite}`,
      );
    }

    const punti = saldoPunti(box as unknown as Parameters<typeof saldoPunti>[0], puntoId);
    if (punti < costo) {
      log.info('acquisto rifiutato: servono %d P, ne ha %d', costo, punti);
      return encryptAndSend(
        { point: { amount: punti, mst_event_point_id: puntoId } },
        res, req, ERROR_CODE.ZENY_NOT_ENOUGH, ERROR_CATEGORY.ERROR_DIALOG,
        `Trade Points insufficient: need ${costo}, have ${punti}`,
      );
    }

    // Si scala solo dopo aver superato tutti i controlli, mai prima.
    const riga = (box.points ??= []).find((p) => Number(p.mst_event_point_id) === puntoId)!;
    riga.amount = punti - costo;

    if (!box.materials) box.materials = [];
    if (!box.growth_items) box.growth_items = [];
    if (articolo.famiglia === 'growth_items') {
      const esistente = box.growth_items.find((g) => Number(g?.mst_growth_item_id) === articolo.id);
      if (esistente) esistente.amount = Number(esistente.amount ?? 0) + quanti;
      else box.growth_items.push({ mst_growth_item_id: articolo.id, amount: quanti });
    } else {
      const esistente = box.materials.find((m) => Number(m?.mst_material_id) === articolo.id);
      if (esistente) esistente.amount = Number(esistente.amount ?? 0) + quanti;
      else box.materials.push({ mst_material_id: articolo.id, amount: quanti });
    }

    doc.markModified('box');
    // Stock: keyed by game day, so it refills itself at the 05:00 rollover.
    await registraAcquistoAsync(doc, articolo.id, quanti);
    await doc.save();

    log.info(
      'acquisto | %s x%d per %d P (restano %d P, pezzo %d/%d)',
      articolo.titolo, quanti, costo, punti - costo, giaPresi + quanti, articolo.limite,
    );

    const contenuto =
      articolo.famiglia === 'growth_items'
        ? { growth_items: [{ amount: quanti, mst_growth_item_id: articolo.id }] }
        : { materials: [{ amount: quanti, mst_material_id: articolo.id }] };
    const data = {
      item_contents: contenuto,
      /*
       * The new balance MUST go in `point`, a single object -- not in a
       * top-level `points` array, and not in `item_contents.points`.
       *
       * Read out of the client:
       *   cAPIShopBuy::Response::setup  parses only `item_contents` (+0x60) and
       *       `point.amount` -> +0x2e0 / `point.mst_event_point_id` -> +0x2e8.
       *       A top-level `points` array is never looked at.
       *   sServer::setupShopBuyResponse (0x1937b40) then writes that amount
       *       into its local cItemPoint map.
       *   uGUIMenuExchange::updateDispExchangePoint reads the header number from
       *       sServer::getItemPointNum(), i.e. from that map -- so without
       *       `point` the counter shows the pre-purchase balance until the box
       *       is fetched again (a game restart).
       *
       * Same object shape the equipment-sale response already uses
       * (equip_sell.point, box.controller.ts), whose parser is identical.
       */
      point: { amount: punti - costo, mst_event_point_id: puntoId },
    };
    encryptAndSend(data, res, req);
  } catch (error) {
    log.error('Errore in shop buy:', error);
    encryptAndSend({}, res, req, ERROR_CODE.GENERIC_ERROR, ERROR_CATEGORY.ERROR_DIALOG, 'Buy failed');
  }
};
