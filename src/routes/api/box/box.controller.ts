import { Request, Response } from 'express';
import { encryptAndSend } from '../../../services/crypto/encryptionHelpers.js';
import { ERROR_CODE, ERROR_CATEGORY } from '../../../constants/error.codes.js';
import { createLogger } from '../../../middleware/logger.js';
import User from '../../../model/user.js';
import { calcMstId as _calcMstId } from '../../../services/defineService.js';
import prezziVendita from '../../../json/prezzi-vendita.json' with { type: 'json' };
import COSTI from '../../../json/upgrade-costs.json' with { type: 'json' };
import omamoriData from '../../../json/omamori.json' with { type: 'json' };
import { KARIDAMA_IDS, spendiKaridama } from '../../../services/karidamaService.js';
import { saldiPayments, paymentsDaSalvare } from '../../../services/paymentService.js';
import { expCrescitaPartner, crescitaPerPartner, applicaExpPartner, CRESCITA_PARTNER } from '../../../services/partnerGrow.js';
import { dimenticaSubSkillOtomo, OTOMO_NO_SKILL } from '../../../services/otomoQuest.js';
import { sistemaMercenari } from '../../../services/setMercenari.js';
import type { BoxGetInput, StorageGetInput, EquipLevelupInput, EquipAwakeInput, PotentialupAutoSetInput, SaleInput, FavoriteSetInput, MonumentLevelupInput } from './box.schema.js';
import type { SessionOnlyInput } from '../../../schemas/common.schema.js';
const log = createLogger('box');

/**
 * Upgrade cost tables (src/json/upgrade-costs.json). The JSON import is typed
 * from the file itself, which loses the index signatures; see upgrade-costs.d.ts.
 */
interface TabellaCosti {
  zenyByRarity: Record<string, number>;
  /** Material-set index -> its materials. */
  materialSets: Record<string, { mst_material_id: number; amount: number }[]>;
  /** strengthenNeedMaterialId -> per-level set index (index lv = step lv -> lv+1). */
  strengthRef: Record<string, number[]>;
  equipment: Record<string, { name: string; rarity: number; levelMax: number; strengthenNeedMaterialId: number }>;
}

/** A material row in the box. */
interface VoceMateriale {
  mst_material_id?: number | null;
  amount?: number | null;
}

/**
 * Full growth-item list to hand back to the client.
 *
 * The partner menu keeps a quantity per row and refreshes the rows it is told
 * about. If a row is *omitted* once it hits zero, the menu keeps showing the old
 * number, so the player can still "select" orbs that were already spent -- and
 * the next level-up then fails. Sending the whole catalogue (services/
 * partnerGrow.ts), zeros included, keeps the menu in step.
 */
function elencoCrescita(box: { growth_items?: { mst_growth_item_id?: number | null; amount?: number | null }[] }): { mst_growth_item_id: number; amount: number }[] {
  const perId = new Map<number, number>();
  for (const g of box.growth_items ?? []) {
    const id = Number(g.mst_growth_item_id);
    perId.set(id, (perId.get(id) ?? 0) + Number(g.amount ?? 0));
  }
  const catalogo = new Set<number>(CRESCITA_PARTNER.map((g) => g.id));
  const out = CRESCITA_PARTNER.map((g) => ({ mst_growth_item_id: g.id, amount: Math.max(0, perId.get(g.id) ?? 0) }));
  // Any growth item already in the box that is not in the catalogue: keep it.
  for (const [id, amount] of perId) {
    if (!catalogo.has(id)) out.push({ mst_growth_item_id: id, amount: Math.max(0, amount) });
  }
  return out;
}

export const get = async (req: Request, res: Response) => {
  try {
    const { session_id } = req.body as BoxGetInput;
    const filter = { current_session: session_id };

    const doc = await User.findOne(filter);
    if (!doc) {
      return encryptAndSend({}, res, req, ERROR_CODE.NOT_AUTHENTICATED); //Not authenticated
    }
    // Prima che il gioco scarichi il box: ogni mercenario deve avere la sua arma
    // e un set valido, altrimenti il menu equipaggiamento va in crash.
    const m = await sistemaMercenari(doc.toObject(), (f, u) => User.updateOne(f, u));
    if (m.aggiunti.length || m.setCambiati) log.info('mercenari | %s: armi aggiunte %d, set sistemati %s', doc.character_name ?? '?', m.aggiunti.length, m.setCambiati);
    const data = {
      box: m.box,
    };
    encryptAndSend(data, res, req);
  } catch (error) {
    log.error('Error in box get:', error);
    encryptAndSend({}, res, req, ERROR_CODE.GENERIC_ERROR, ERROR_CATEGORY.ERROR_DIALOG, 'Get box failed');
  }
};
export const storageInfo = (req: Request, res: Response) => {
  const data = {
    storage_info: {
      storage_details: [
        {
          max: 200,
          name: '装備倉庫1',
          now: 0,
          storage_idx: 1,
        },
      ],
      storage_limit: 5,
      storage_num: 1,
    },
  };
  encryptAndSend(data, res, req);
};

export const storageGet = (req: Request, res: Response) => {
  const { target_idx: _target_idx } = req.body as StorageGetInput;

  const data = {
    storage_info: {
      storage_details: [
        {
          max: 200,
          name: '装備倉庫1',
          now: 0,
          storage_idx: 1,
        },
      ],
      storage_limit: 5,
      storage_num: 1,
    },

    storages: [
      {
        awaked: 1,
        created: 1625155200,
        elv: 5,
        endAwakeCount: 3,
        endAwakeRemain: 1,
        end_remain: 10,
        equipment_id: 'EQP123456',
        favorite: 0,
        is_awake: 1,
        mst_equipment_id: 2006810019,
        potential: 120,
        slv: 4,
        start_remain: 15,
        storage_idx: 1,
      },
    ],
  };
  encryptAndSend(data, res, req);
};

export const otomoGet = async (req: Request, res: Response) => {
  try {
    const { session_id } = req.body as BoxGetInput;
    const filter = { current_session: session_id };

    const doc = await User.findOne(filter);
    if (!doc) {
      return encryptAndSend({}, res, req, ERROR_CODE.NOT_AUTHENTICATED); //Not authenticated
    }
    if (!doc.box) {
      return encryptAndSend({}, res, req, ERROR_CODE.GENERIC_ERROR, ERROR_CATEGORY.ERROR_DIALOG, 'Box not found');
    }
    const data = {
      otomos: doc.box.otomos,
    };
    encryptAndSend(data, res, req);
  } catch (error) {
    log.error('Error in otomoGet:', error);
    encryptAndSend({}, res, req, ERROR_CODE.GENERIC_ERROR, ERROR_CATEGORY.ERROR_DIALOG, 'Get otomo box failed');
  }
};

// Analoga a otomoGet sopra: la "get" per i gatti Partner (nekojara) non
// era mai stata scritta (box.router.ts la aveva solo commentata), quindi il
// client non poteva nemmeno elencare quali Partner possiede il giocatore —
// box.partners esiste gia' sul modello (vedi model/user.ts) e viene
// popolato da tutorial/quest, semplice passthrough di dati reali, nessun id
// inventato.
export const partnerGet = async (req: Request, res: Response) => {
  try {
    const { session_id } = req.body as BoxGetInput;
    const filter = { current_session: session_id };

    const doc = await User.findOne(filter);
    if (!doc) {
      return encryptAndSend({}, res, req, ERROR_CODE.NOT_AUTHENTICATED); //Not authenticated
    }
    if (!doc.box) {
      return encryptAndSend({}, res, req, ERROR_CODE.GENERIC_ERROR, ERROR_CATEGORY.ERROR_DIALOG, 'Box not found');
    }
    const data = {
      partners: doc.box.partners,
    };
    encryptAndSend(data, res, req);
  } catch (error) {
    log.error('Error in partnerGet:', error);
    encryptAndSend({}, res, req, ERROR_CODE.GENERIC_ERROR, ERROR_CATEGORY.ERROR_DIALOG, 'Get partner box failed');
  }
};

/*
 * PARTNER LEVEL-UP ("Growth").
 *
 * The client sends the growth items to feed and the partner to grow; we add
 * their EXP (Shard 100, Orb 500), level the partner up along the game's real
 * cumulative curve (src/json/partner-grow.json) and, if the exp passes the
 * current cap, unlock the next limit-break tier (20 -> 30 -> 50). The reply is
 * the updated partner plus the remaining growth items.
 *
 * Contract read from the client:
 *   cAPIBoxPartnerLevelup::Request::to_json  sends growth_items[{amount,mst_growth_item_id}], partner_id
 *   cAPIBoxPartnerLevelup::Response::setup   reads partner{...}, growth_items[]
 */
export const partnerLevelup = async (req: Request, res: Response) => {
  try {
    const { session_id, partner_id, growth_items } = req.body as {
      session_id?: string;
      partner_id?: unknown;
      growth_items?: { mst_growth_item_id?: unknown; amount?: unknown }[];
    };
    const doc = session_id ? await User.findOne({ current_session: session_id }) : null;
    if (!doc?.box) {
      return encryptAndSend({}, res, req, ERROR_CODE.NOT_AUTHENTICATED);
    }

    const partner = (doc.box.partners ?? []).find((p) => String(p.partner_id) === String(partner_id));
    if (!partner) {
      return encryptAndSend({}, res, req, ERROR_CODE.GENERIC_ERROR, ERROR_CATEGORY.ERROR_DIALOG, 'Partner not found');
    }

    // Sum the EXP the requested items are worth, and how many of each to spend.
    const consumo = new Map<number, number>();
    let guadagno = 0;
    for (const g of Array.isArray(growth_items) ? growth_items : []) {
      const id = Number(g?.mst_growth_item_id);
      const amount = Math.max(0, Math.floor(Number(g?.amount) || 0));
      const exp = expCrescitaPartner(id);
      // Skip items that are not for this partner (Colorless is for anyone).
      if (!exp || amount <= 0 || !crescitaPerPartner(id, Number(partner.mst_partner_id))) continue;
      guadagno += exp * amount;
      consumo.set(id, (consumo.get(id) ?? 0) + amount);
    }
    if (guadagno <= 0) {
      return encryptAndSend({}, res, req, ERROR_CODE.GENERIC_ERROR, ERROR_CATEGORY.ERROR_DIALOG, 'No growth items selected');
    }

    // Own them all, before touching anything.
    for (const [id, amount] of consumo) {
      const posseduti = (doc.box.growth_items ?? [])
        .filter((g) => Number(g.mst_growth_item_id) === id)
        .reduce((t, g) => t + Number(g.amount ?? 0), 0);
      if (posseduti < amount) {
        return encryptAndSend(
          { growth_items: elencoCrescita(doc.box) },
          res, req, ERROR_CODE.MATERIALS_NOT_ENOUGH, ERROR_CATEGORY.ERROR_DIALOG,
          `Growth item ${id}: need ${amount}, have ${posseduti}`,
        );
      }
    }

    const esito = applicaExpPartner(partner, guadagno);
    partner.level = esito.level;
    partner.exp = esito.exp;
    partner.exp_max = esito.exp_max;
    partner.level_cap_tier = esito.level_cap_tier;
    partner.level_max = esito.level_max;

    // Spend the items (merge duplicates, drop empty rows).
    const perId = new Map<number, number>();
    for (const g of doc.box.growth_items ?? []) {
      const id = Number(g.mst_growth_item_id);
      perId.set(id, (perId.get(id) ?? 0) + Number(g.amount ?? 0));
    }
    for (const [id, amount] of consumo) perId.set(id, (perId.get(id) ?? 0) - amount);
    // Keep rows that reached zero: the client's menu only refreshes the rows it
    // is told about, and dropping a row leaves its old count on screen.
    doc.box.growth_items = [...perId.entries()].map(([mst_growth_item_id, amount]) => ({
      mst_growth_item_id,
      amount: Math.max(0, amount),
    }));

    await User.updateOne(
      { _id: doc._id },
      { $set: { 'box.partners': doc.box.partners, 'box.growth_items': doc.box.growth_items } },
    );

    log.info(
      'partner | %s: %s -> lv%d (+%d exp%s)',
      doc.character_name ?? '?', partner.partner_id, esito.level, guadagno,
      esito.limitBreak ? `, LIMIT BREAK tier ${esito.level_cap_tier} (max ${esito.level_max})` : '',
    );

    encryptAndSend(
      {
        partner: {
          created: Number(partner.created ?? 0),
          exp: esito.exp,
          exp_max: esito.exp_max,
          level: esito.level,
          level_cap_tier: esito.level_cap_tier,
          level_max: esito.level_max,
          mst_partner_id: Number(partner.mst_partner_id),
          partner_id: partner.partner_id,
        },
        growth_items: elencoCrescita(doc.box),
      },
      res, req,
    );
  } catch (error) {
    log.error('Error in partnerLevelup:', error);
    encryptAndSend({}, res, req, ERROR_CODE.GENERIC_ERROR, ERROR_CATEGORY.ERROR_DIALOG, 'Partner level up failed');
  }
};

/*
 * PALICO SKILL REMOVE (box/otomo/skill/remove) -- "dimentica una skill".
 *
 * Il client lo chiama quando il palico ha imparato una subskill oltre il numero
 * di slot (0 sotto il 10, poi 1/2/3 agli sblocchi 10/25/75) e il giocatore
 * sceglie quale dimenticare. La richiesta e'
 *   cAPIBoxOtomoSkillRemove::Request: { otomo, otomo_id, mst_skill_id }
 * e la risposta rimanda l'otomo aggiornato: { otomo: {...} }.
 *
 * Togliere la skill dall'array (invece di lasciarci il segnaposto "No Skill")
 * e' quello che evita il bug per cui la skill imparata dopo compariva come
 * "No Skill": il segnaposto non deve mai restare in lista.
 */
export const otomoSkillRemove = async (req: Request, res: Response) => {
  try {
    const { session_id, otomo_id, mst_skill_id } = req.body as {
      session_id?: string;
      otomo_id?: unknown;
      mst_skill_id?: unknown;
    };
    const doc = session_id ? await User.findOne({ current_session: session_id }) : null;
    if (!doc?.box) {
      return encryptAndSend({}, res, req, ERROR_CODE.NOT_AUTHENTICATED);
    }
    const otomo = (doc.box.otomos ?? []).find((o) => String(o.otomo_id) === String(otomo_id));
    if (!otomo) {
      return encryptAndSend({}, res, req, ERROR_CODE.GENERIC_ERROR, ERROR_CATEGORY.ERROR_DIALOG, 'Otomo not found');
    }

    const tolta = dimenticaSubSkillOtomo(otomo as unknown as { subskill?: number[] | null }, Number(mst_skill_id));
    await User.updateOne({ _id: doc._id }, { $set: { 'box.otomos': doc.box.otomos } });

    log.info('palico | %s: dimentica skill %s da %s (%s)', doc.character_name ?? '?', String(mst_skill_id), String(otomo_id), tolta ? 'ok' : 'non presente');

    encryptAndSend(
      {
        otomo: {
          created: Number(otomo.created ?? 0),
          exp: Number(otomo.exp ?? 0),
          mst_otomo_id: Number(otomo.mst_otomo_id),
          otomo_id: otomo.otomo_id,
          subskill: (otomo.subskill ?? []).filter((s) => s !== OTOMO_NO_SKILL),
        },
      },
      res, req,
    );
  } catch (error) {
    log.error('Error in otomoSkillRemove:', error);
    encryptAndSend({}, res, req, ERROR_CODE.GENERIC_ERROR, ERROR_CATEGORY.ERROR_DIALOG, 'Otomo skill remove failed');
  }
};

/*
 * GROWTH ITEM BOX (box/growthitem/get).
 *
 * The client refreshes the growth-item list through this route right after
 * feeding a partner; it was never registered, so every level-up finished on a
 * 404 (and any other screen reading the list failed too). It sends an optional
 * `growth_items` filter, but the reply is simply the whole list:
 * cAPIBoxGrowthItemGet::Response::setup reads `growth_items[]` of
 * { amount, mst_growth_item_id } -- the same shape partnerLevelup returns.
 */
export const growthitemGet = async (req: Request, res: Response) => {
  try {
    const { session_id } = req.body as SessionOnlyInput;
    const doc = session_id ? await User.findOne({ current_session: session_id }) : null;
    if (!doc?.box) {
      return encryptAndSend({}, res, req, ERROR_CODE.NOT_AUTHENTICATED);
    }
    encryptAndSend({ growth_items: elencoCrescita(doc.box) }, res, req);
  } catch (error) {
    log.error('Error in growthitemGet:', error);
    encryptAndSend({}, res, req, ERROR_CODE.GENERIC_ERROR, ERROR_CATEGORY.ERROR_DIALOG, 'Get growth items failed');
  }
};

// Equipment box capacity (box.capacity.eqp_box -- NOT `equipaggiamento`, which
// no schema ever defined; reading it always fell back to 100, so the client
// showed a 100 cap while the box really allowed 500).
const CAPACITY_EQUIP = 500;
// Slots added per expansion. The client's confirmation says "+5".
const SLOT_PER_ESPANSIONE = 5;
// Hunter Coins charged per expansion. 0 = free. Tunable without a rebuild.
const PREZZO_ESPANSIONE_BOX = Math.max(0, Number(process.env.BOX_EXPAND_PRICE ?? 0) || 0);

export const equipCapacityInfo = async (req: Request, res: Response) => {
  try {
    const sessione = sessioneDa(req.body);
    const doc = sessione ? await User.findOne({ current_session: sessione }) : null;
    const box = doc?.box as unknown as { equipments?: unknown[]; capacity?: { eqp_box?: number } } | undefined;
    const max = Number(box?.capacity?.eqp_box) || CAPACITY_EQUIP;
    const now = Array.isArray(box?.equipments) ? box!.equipments!.length : 0;
    encryptAndSend({ max, now, price: PREZZO_ESPANSIONE_BOX }, res, req);
  } catch (error) {
    log.error('Error in equipCapacityInfo:', error);
    encryptAndSend({}, res, req, ERROR_CODE.GENERIC_ERROR, ERROR_CATEGORY.ERROR_DIALOG, 'Equipment capacity info failed');
  }
};

export const equipCapacityExpand = async (req: Request, res: Response) => {
  try {
    const sessione = sessioneDa(req.body);
    const doc = sessione ? await User.findOne({ current_session: sessione }) : null;
    if (!doc?.box) {
      return encryptAndSend({}, res, req, ERROR_CODE.NOT_AUTHENTICATED);
    }
    const box = doc.box as unknown as {
      equipments?: unknown[];
      capacity?: { eqp_box?: number };
      payments?: { mst_payment_id?: number | null; amount?: number | null }[];
    };

    if (PREZZO_ESPANSIONE_BOX > 0 && !spendiKaridama(box as { payments?: { mst_payment_id?: number | null; amount?: number | null }[] }, PREZZO_ESPANSIONE_BOX)) {
      return encryptAndSend(
        { capacity: Number(box.capacity?.eqp_box) || CAPACITY_EQUIP, payments: saldiPayments(box.payments) },
        res, req, ERROR_CODE.ZENY_NOT_ENOUGH, ERROR_CATEGORY.ERROR_DIALOG,
        'Not enough Hunter Coins',
      );
    }

    const nuovoMax = (Number(box.capacity?.eqp_box) || CAPACITY_EQUIP) + SLOT_PER_ESPANSIONE;
    box.capacity = { ...(box.capacity ?? {}), eqp_box: nuovoMax };

    // Dotted whole-value writes: a nested scalar edit is not marked dirty by
    // save() on its own, and the payments array is written whole for the same
    // reason the Trade Points are (see tradePointsService.ts).
    const update: Record<string, unknown> = { 'box.capacity.eqp_box': nuovoMax };
    if (PREZZO_ESPANSIONE_BOX > 0) update['box.payments'] = paymentsDaSalvare(box.payments);
    await User.updateOne({ _id: doc._id }, { $set: update });

    log.info('espansione box | %s: %d -> %d', doc.character_name ?? '?', nuovoMax - SLOT_PER_ESPANSIONE, nuovoMax);
    encryptAndSend({ capacity: nuovoMax, payments: saldiPayments(box.payments) }, res, req);
  } catch (error) {
    log.error('Error in equipCapacityExpand:', error);
    encryptAndSend({}, res, req, ERROR_CODE.GENERIC_ERROR, ERROR_CATEGORY.ERROR_DIALOG, 'Equipment capacity expand failed');
  }
};

export const stampGet = (req: Request, res: Response) => {
  const data = {
    stamp_sets: [
      {
        created: 0,
        mst_stamp_set_id: 67667029,
      },
    ],
  };
  encryptAndSend(data, res, req);
};
export const stampHoldGet = async (req: Request, res: Response) => {
  try {
    const { session_id } = req.body as SessionOnlyInput;
    const doc = await User.findOne({ current_session: session_id });
    encryptAndSend({ hold_stamp_ids: doc?.hold_stamp_ids ?? [] }, res, req);
  } catch (error) {
    log.error('Error in stampHoldGet:', error);
    encryptAndSend({ hold_stamp_ids: [] }, res, req);
  }
};

/**
 * box/stamp/hold/set: which (up to four) stamps the player displays.
 *
 * This route did not exist, so the client's "set stamps" call 404'd and, because
 * the screen retries until it succeeds, the only way out was to kill the app.
 * The client parses exactly `hold_stamp_ids` back (cAPIBoxStampHoldSet::Response
 * ::setup), so we store the list and echo it.
 */
export const holdStampSet = async (req: Request, res: Response) => {
  try {
    const { session_id, hold_stamp_ids } = req.body as { session_id: string; hold_stamp_ids?: unknown };
    const doc = await User.findOne({ current_session: session_id });
    if (!doc) {
      return encryptAndSend({}, res, req, ERROR_CODE.NOT_AUTHENTICATED);
    }
    const ids = (Array.isArray(hold_stamp_ids) ? hold_stamp_ids : []).slice(0, 4).map((n) => Number(n) || 0);
    await User.updateOne({ _id: doc._id }, { $set: { hold_stamp_ids: ids } });
    log.info('francobolli | %s imposta %j', doc.character_name ?? '?', ids);
    encryptAndSend({ hold_stamp_ids: ids }, res, req);
  } catch (error) {
    log.error('Error in holdStampSet:', error);
    encryptAndSend({}, res, req, ERROR_CODE.GENERIC_ERROR, ERROR_CATEGORY.ERROR_DIALOG, 'Stamp hold set failed');
  }
};

export const stampShopList = (req: Request, res: Response) => {
  const data = {
    stamp_shop_list: [
      {
        end: 0,
        mst_stamp_set_id: 67667029,
        // `remain_time`, not `remain_id`: the client parses the former and an
        // unknown key left the row reading as already exchanged/expired.
        remain_time: 36000,
        start: 0,
        type: 0,
        value: 1,
      },
    ],
  };
  encryptAndSend(data, res, req);
};

/**
 * box/stamp/shop/buy. No master-data price table was available, so the row is
 * free for now; the reply carries `payments` (the client replaces its cached
 * balances with whatever comes back) and the bought `mst_stamp_set_id`.
 */
export const stampShopBuy = async (req: Request, res: Response) => {
  try {
    const { session_id, mst_stamp_set_id } = req.body as { session_id: string; mst_stamp_set_id?: unknown };
    const doc = await User.findOne({ current_session: session_id });
    if (!doc) {
      return encryptAndSend({}, res, req, ERROR_CODE.NOT_AUTHENTICATED);
    }
    encryptAndSend(
      { payments: saldiPayments(doc.box?.payments), mst_stamp_set_id: Number(mst_stamp_set_id) || 0 },
      res, req,
    );
  } catch (error) {
    log.error('Error in stampShopBuy:', error);
    encryptAndSend({}, res, req, ERROR_CODE.GENERIC_ERROR, ERROR_CATEGORY.ERROR_DIALOG, 'Stamp shop buy failed');
  }
};
export const paymentLimitGet = (req: Request, res: Response) => {
  const data = {
    payment_limits: [
      {
        amount: 10000,
        created: 1725029111,
        limit: 10000,
        mst_payment_id: 1573159746,
      },
      {
        amount: 10000,
        created: 1725029111,
        limit: 10000,
        mst_payment_id: 3301823224,
      },
      {
        amount: 10000,
        created: 1725029111,
        limit: 10000,
        mst_payment_id: 3016417902,
      },
    ],
  };
  encryptAndSend(data, res, req);
};

// Tipi di valuta premium noti, con la quantita' di partenza usata quando
// l'utente non ne possiede affatto. Serve tenerli tutti nella risposta: il
// client si aspetta l'elenco completo, non solo quelli che il giocatore ha.
// Tutti e 6 i tipi di 狩玉 (item_payment), il client si aspetta l'elenco completo.
// Quantita' 0 se il giocatore non ne ha: prima qui c'erano 50/25/5/3/2/1 finti,
// mostrati in gioco ma inesistenti (il gacha poi li rifiutava).
const PAYMENT_DEFAULTS: { amount: number; mst_payment_id: number }[] = KARIDAMA_IDS.map((id) => ({ amount: 0, mst_payment_id: Number(id) }));

export const PaymentGet = async (req: Request, res: Response) => {
  try {
    // Prima restituiva la lista qui sopra fissa, senza mai guardare il database:
    // qualunque cosa si scrivesse in box.payments veniva ignorata, e il giocatore
    // vedeva sempre e solo i valori di partenza. Ora vince il salvataggio vero.
    const { session_id } = req.body as { session_id: string };
    const doc = await User.findOne({ current_session: session_id });
    if (!doc) {
      return encryptAndSend({}, res, req, ERROR_CODE.NOT_AUTHENTICATED);
    }

    const posseduti = new Map<number, number>();
    for (const p of doc.box?.payments ?? []) {
      if (typeof p?.mst_payment_id === 'number') {
        posseduti.set(p.mst_payment_id, p.amount ?? 0);
      }
    }

    // Ogni tipo noto con la quantita' dell'utente se ce l'ha, altrimenti il default.
    const payments = PAYMENT_DEFAULTS.map((d) => ({
      mst_payment_id: d.mst_payment_id,
      amount: posseduti.has(d.mst_payment_id) ? posseduti.get(d.mst_payment_id)! : d.amount,
    }));

    // Eventuali valute possedute che non sono nell'elenco noto: le aggiungo in coda.
    for (const [id, amount] of posseduti) {
      if (!PAYMENT_DEFAULTS.some((d) => d.mst_payment_id === id)) {
        payments.push({ mst_payment_id: id, amount });
      }
    }

    encryptAndSend({ payments }, res, req);
  } catch (error) {
    log.error('Error in payment get:', error);
    encryptAndSend({}, res, req, ERROR_CODE.GENERIC_ERROR, ERROR_CATEGORY.ERROR_DIALOG, 'Get payments failed');
  }
};

/*
 * Equipment level-up ("enhancement").
 *
 * Costs come from the game's own master data, extracted into
 * src/json/upgrade-costs.json by tools-js/build-upgrade-costs.cjs:
 *
 *   zenny    = sum over the levels gained of floor((zenyBase[rarity] - 10) * fromLevel / 16)
 *   materials = the piece's mStrengthenNeedMaterialID row, x1 per level gained
 *
 * The client works out and displays the same figures before the player confirms,
 * so the server has to agree with them or the balance ends up wrong. The zenny
 * formula reproduces the client's own displayed cost exactly for the one piece
 * we could check (a rarity 8 lance, 14,981 / 30,461 / 46,441 zenny for level
 * 30 -> 31 / 32 / 33); see docs/UPGRADE-COSTS.md for the derivation and for
 * what has NOT been verified.
 *
 * This route used to raise `elv` for free and reply with no zenny and no
 * material list at all. The client reads the remaining zenny straight out of
 * the response, so it carried on showing the pre-upgrade figure -- and the
 * balance it displayed jumped to 999,999,999 (0x3B9AC9FF, the client's "unset"
 * sentinel) whenever the level-up screen refreshed it.
 */
export const equipLevelup = async (req: Request, res: Response) => {
  try {
    const { session_id, eqp_obj_id, num } = req.body as EquipLevelupInput;
    const filter = { current_session: session_id };
    const doc = await User.findOne(filter);
    if (!doc) {
      return encryptAndSend({}, res, req, ERROR_CODE.NOT_AUTHENTICATED); // Not authenticated
    }
    if (!doc.box) {
      return encryptAndSend({}, res, req, ERROR_CODE.GENERIC_ERROR, ERROR_CATEGORY.ERROR_DIALOG, 'Box not found');
    }

    const equipmentId: string = eqp_obj_id;
    const steps: number = Math.max(1, num || 1);

    // Find equipment in user's box
    const equipmentIndex = doc.box.equipments!.findIndex((eq) => eq.equipment_id === equipmentId);

    if (equipmentIndex === -1) {
      // Equipment not found
      return encryptAndSend({}, res, req, ERROR_CODE.EQUIPMENT_NOT_FOUND, ERROR_CATEGORY.NONE, 'equipment not found');
    }

    const equipment = doc.box.equipments?.[equipmentIndex];
    if (!equipment) {
      return encryptAndSend({}, res, req, ERROR_CODE.EQUIPMENT_NOT_FOUND, ERROR_CATEGORY.NONE, 'equipment not found');
    }

    const currentLevel = Number(equipment.elv ?? 0);

    // Master data for this piece, or we cannot price the upgrade. Every weapon
    // and armour piece is in the table, so this only trips on a stale id.
    const tabella = COSTI as unknown as TabellaCosti;
    const mst = tabella.equipment[String(equipment.mst_equipment_id)];
    if (!mst) {
      log.warn('potenziamento | mst_equipment_id %s assente dai costi', equipment.mst_equipment_id);
      return encryptAndSend({}, res, req, ERROR_CODE.GENERIC_ERROR, ERROR_CATEGORY.ERROR_DIALOG, 'No cost data for this equipment');
    }

    const baseZeny = Number(tabella.zenyByRarity[String(mst.rarity)] ?? 0);
    if (baseZeny <= 0) {
      log.warn('potenziamento | rarita %d assente dai costi', mst.rarity);
      return encryptAndSend({}, res, req, ERROR_CODE.GENERIC_ERROR, ERROR_CATEGORY.ERROR_DIALOG, 'No cost data for this equipment');
    }

    // Each level costs a little more than the last, so the levels actually
    // gained have to be summed one by one.
    let zenny = 0;
    for (let lv = currentLevel; lv < currentLevel + steps; lv++) {
      zenny += Math.floor(((baseZeny - 10) * lv) / 16);
    }

    /*
     * Materials, PER LEVEL. The game stores a set index per level step:
     *   strengthRef[strengthenNeedMaterialId][lv]  ->  materialSets[...]
     * so the step lv -> lv+1 uses that set. The old code used one fixed set for
     * every level, so past ~level 29 it asked for the wrong materials and
     * refused legitimate upgrades with error 81 (MATERIALS_NOT_ENOUGH).
     */
    const ref = tabella.strengthRef[String(mst.strengthenNeedMaterialId)] ?? [];
    const fabbisogno = new Map<number, number>();
    for (let lv = currentLevel; lv < currentLevel + steps; lv++) {
      const setIdx = ref[lv];
      if (setIdx === undefined || setIdx === -1) continue;
      for (const m of tabella.materialSets[String(setIdx)] ?? []) {
        fabbisogno.set(m.mst_material_id, (fabbisogno.get(m.mst_material_id) ?? 0) + Number(m.amount ?? 0));
      }
    }
    const materialSet = [...fabbisogno.entries()].map(([mst_material_id, amount]) => ({ mst_material_id, amount }));

    // Enough zenny?
    const zenyPosseduti = Number(doc.box.zeny ?? 0);
    if (zenny > zenyPosseduti) {
      return encryptAndSend(
        { zeny: zenyPosseduti },
        res,
        req,
        ERROR_CODE.ZENY_NOT_ENOUGH,
        ERROR_CATEGORY.ERROR_DIALOG,
        `Zenny insufficient: need ${zenny}, have ${zenyPosseduti}`,
      );
    }

    // Enough of every material? Checked before anything is deducted, so a
    // refusal leaves the box untouched. (materialSet is already summed over the
    // levels gained, so it must NOT be multiplied by `steps` again.)
    const richiesti = materialSet.map((m: { mst_material_id: number; amount: number }) => ({
      mst_material_id: Number(m.mst_material_id),
      amount: Number(m.amount ?? 0),
    }));
    for (const need of richiesti) {
      const posseduti = (doc.box.materials ?? [])
        .filter((m: VoceMateriale) => Number(m.mst_material_id) === need.mst_material_id)
        .reduce((tot: number, m: VoceMateriale) => tot + Number(m.amount ?? 0), 0);
      if (posseduti < need.amount) {
        return encryptAndSend(
          { materials: [{ mst_material_id: need.mst_material_id, amount: posseduti }] },
          res,
          req,
          ERROR_CODE.MATERIALS_NOT_ENOUGH,
          ERROR_CATEGORY.ERROR_DIALOG,
          `Material ${need.mst_material_id}: need ${need.amount}, have ${posseduti}`,
        );
      }
    }

    // Everything checked out: spend, then level.
    doc.box.zeny = zenyPosseduti - zenny;

    /*
     * Spend the materials. Built from a map keyed by material id rather than
     * by filtering the live array in a loop: the box often holds the same
     * material on several rows (the tutorial creates duplicates), and each
     * pass has to see the rows the previous ones left alone. Rows are merged
     * so the box does not fill up with duplicates the client counts separately.
     */
    const perId = new Map<number, number>();
    for (const m of (doc.box.materials ?? []) as VoceMateriale[]) {
      const id = Number(m.mst_material_id);
      perId.set(id, (perId.get(id) ?? 0) + Number(m.amount ?? 0));
    }
    for (const need of richiesti) {
      perId.set(need.mst_material_id, (perId.get(need.mst_material_id) ?? 0) - need.amount);
    }
    doc.box.materials = [...perId.entries()]
      .filter(([, amount]) => amount > 0)
      .map(([mst_material_id, amount]) => ({ mst_material_id, amount }));

    const newLevel = currentLevel + steps;
    equipment.elv = newLevel;

    // Persist
    await User.findByIdAndUpdate(doc.id, { box: doc.box });

    log.info(
      'potenziamento | %s: %s lv%d -> lv%d, zenny %d (saldo %d), materiali %d',
      doc.character_name ?? '?',
      String(equipment.equipment_id),
      currentLevel,
      newLevel,
      zenny,
      Number(doc.box.zeny ?? 0),
      richiesti.length,
    );

    /*
     * The client reads the post-transaction box out of this response: the
     * remaining zenny, the updated piece, and every material row it should
     * know about. Anything omitted here is what it renders as 999,999,999.
     */
    const data = {
      levelup: {
        equipment: equipment,
      },
      zeny: Number(doc.box.zeny ?? 0),
      materials: (doc.box.materials ?? []).map((m: VoceMateriale) => ({
        mst_material_id: Number(m.mst_material_id),
        amount: Number(m.amount ?? 0),
      })),
    };

    encryptAndSend(data, res, req);
  } catch (error) {
    log.error('Error in equipLevelup:', error);
    encryptAndSend({}, res, req, ERROR_CODE.GENERIC_ERROR, ERROR_CATEGORY.ERROR_DIALOG, 'Equipment level up failed');
  }
};
/*
 * EQUIPMENT AWAKENING / CHARM UNLOCK (box/equipment/awake).
 *
 * The client helper is sPlayer::cAwakeOmamoriAPI and its menu is
 * uMenuEquipOmamoriAwake: this is where a charm (お守り / OD_OMA…) is "released".
 * Request (cAPIBoxEquipmentAwake): { base_equipment_id, resource_equipment_ids,
 * use_karidama }. Response: { base_equipment, payments, resource_equipments,
 * resource_materials }.
 *
 * A charm carries a 技玉 (Skill Orb) + a skill that are INVALID until it is
 * unlocked (MenuCmn: "the charm has not been unlocked, or its expiration has
 * passed, so the Skill Orb and skill are invalid"). The cost lives in the client
 * table omamori_release (Hunter Coins OR materials, + zenny), looked up by the
 * charm's mst_equipment_id (src/json/omamori.json).
 *
 * Two deliberate departures from the original:
 *  - the success roll is dropped: unlocking always succeeds;
 *  - the effect is PERMANENT. The client decides "enabled" in
 *    nPlayerWorkspace::cItemOmamori::isEnableEffect: it needs is_awake=1 and,
 *    for mLimitType 1..5, start_remain <= now <= end_remain (2/3 also need the
 *    awake-remain time > now, 4/5 a non-zero awake count). Those are set to a
 *    far-future / large value so the timer never runs out.
 */
interface OmamoriRelease {
  zenny: number;
  karidama: number;
  sozai: { materialId: number; amount: number }[];
}
const OMAMORI = omamoriData as unknown as {
  byMstId: Record<string, { releaseId: number; rarity: number; name: string }>;
  release: Record<string, OmamoriRelease>;
};
/** 2100-01-01 in unix seconds: any "end" set to this never expires. */
const MAI = 4102444800;

export const awake = async (req: Request, res: Response) => {
  try {
    const sessione = sessioneDa(req.body);
    const doc = sessione ? await User.findOne({ current_session: sessione }) : null;
    if (!doc?.box) {
      return encryptAndSend({}, res, req, ERROR_CODE.NOT_AUTHENTICATED); // Not authenticated
    }
    const base_equipment_id = String((req.body as { base_equipment_id?: unknown }).base_equipment_id ?? '');
    const use_karidama = Math.max(0, Number((req.body as { use_karidama?: unknown }).use_karidama ?? 0) || 0);

    const equipments = (doc.box.equipments ?? []) as unknown as Record<string, unknown>[];
    const idx = equipments.findIndex((e) => e.equipment_id === base_equipment_id);
    if (idx === -1) {
      return encryptAndSend({}, res, req, ERROR_CODE.EQUIPMENT_NOT_FOUND, ERROR_CATEGORY.NONE, 'equipment not found');
    }
    const eq = equipments[idx]!;

    const esito = (consumedMaterials: { mst_material_id: number }[] = []) =>
      encryptAndSend(
        {
          base_equipment: eq,
          payments: saldiPayments(doc.box!.payments),
          resource_equipments: [],
          resource_materials: consumedMaterials,
          zeny: Number(doc.box!.zeny ?? 0),
        },
        res,
        req,
      );

    const info = OMAMORI.byMstId[String(eq.mst_equipment_id)];
    // Not a charm (or already unlocked): echo the piece unchanged.
    if (!info || Number(eq.is_awake) === 1) {
      return esito();
    }

    const rel = OMAMORI.release[String(info.releaseId)] ?? { zenny: 0, karidama: 0, sozai: [] };
    const zenny = Number(rel.zenny ?? 0);
    const zennyPosseduti = Number(doc.box.zeny ?? 0);
    if (zenny > zennyPosseduti) {
      return encryptAndSend(
        { zeny: zennyPosseduti },
        res,
        req,
        ERROR_CODE.ZENY_NOT_ENOUGH,
        ERROR_CATEGORY.ERROR_DIALOG,
        `Zenny insufficient: need ${zenny}`,
      );
    }

    // Cost: Hunter Coins if the client chose that path, otherwise the materials.
    const consumati: { mst_material_id: number }[] = [];
    if (use_karidama > 0) {
      const need = Number(rel.karidama ?? 0);
      if (need > 0 && !spendiKaridama(doc.box, need)) {
        return encryptAndSend(
          { payments: saldiPayments(doc.box.payments) },
          res,
          req,
          ERROR_CODE.KARIDAMA_NOT_ENOUGH,
          ERROR_CATEGORY.ERROR_DIALOG,
          `Karidama insufficient: need ${need}`,
        );
      }
    } else {
      const richiesti = (rel.sozai ?? [])
        .map((s) => ({ mst_material_id: Number(s.materialId), amount: Number(s.amount ?? 0) }))
        .filter((s) => s.amount > 0);
      const perId = new Map<number, number>();
      for (const m of (doc.box.materials ?? []) as VoceMateriale[]) {
        const id = Number(m.mst_material_id);
        perId.set(id, (perId.get(id) ?? 0) + Number(m.amount ?? 0));
      }
      for (const need of richiesti) {
        const posseduti = perId.get(need.mst_material_id) ?? 0;
        if (posseduti < need.amount) {
          return encryptAndSend(
            { materials: [{ mst_material_id: need.mst_material_id, amount: posseduti }] },
            res,
            req,
            ERROR_CODE.MATERIALS_NOT_ENOUGH,
            ERROR_CATEGORY.ERROR_DIALOG,
            `Material ${need.mst_material_id}: need ${need.amount}, have ${posseduti}`,
          );
        }
      }
      for (const need of richiesti) {
        perId.set(need.mst_material_id, (perId.get(need.mst_material_id) ?? 0) - need.amount);
        consumati.push({ mst_material_id: need.mst_material_id });
      }
      doc.box.materials = [...perId.entries()]
        .filter(([, a]) => a > 0)
        .map(([mst_material_id, amount]) => ({ mst_material_id, amount }));
    }

    doc.box.zeny = zennyPosseduti - zenny;

    // Unlock for good: no expiry, no use limit.
    eq.is_awake = 1;
    eq.awaked = 1;
    eq.start_remain = 0;
    eq.end_remain = MAI;
    eq.endAwakeRemain = MAI;
    eq.endAwakeCount = 9999;
    eq.evolve_start_time = Math.floor(Date.now() / 1000);

    await User.findByIdAndUpdate(doc.id, { box: doc.box });

    log.info(
      'omamori | %s: %s sbloccato (karidama %d, materiali %d, zenny %d)',
      doc.character_name ?? '?',
      base_equipment_id,
      use_karidama > 0 ? Number(rel.karidama ?? 0) : 0,
      consumati.length,
      zenny,
    );
    return esito(consumati);
  } catch (error) {
    log.error('Error in awake:', error);
    encryptAndSend({}, res, req, ERROR_CODE.GENERIC_ERROR, ERROR_CATEGORY.ERROR_DIALOG, 'Equipment awake failed');
  }
};

/*
 * "Auto-set" the materials used for potential (awakening) upgrades.
 *
 * The mechanic itself is not implemented -- there is no potential-upgrade cost
 * table in the repo -- so this does nothing and says so.
 *
 * It used to return a fully invented payload: equipment "EQP_ABC123", a fake
 * partner payment, made-up materials, and `zeny: 999999`. The client applies the
 * zenny value, so the on-screen balance jumped to 999999999 after touching this
 * screen and only snapped back on the next request that re-read the real box.
 *
 * It now echoes the caller's REAL state with nothing changed, so the client
 * displays the balance it should have.
 */
export const potentialupAutoSet = async (req: Request, res: Response) => {
  try {
    const sessione = sessioneDa(req.body);
    const doc = sessione ? await User.findOne({ current_session: sessione }) : null;
    if (!doc?.box) {
      return encryptAndSend({}, res, req, ERROR_CODE.NOT_AUTHENTICATED);
    }
    const box = doc.box as unknown as {
      equipments?: unknown[];
      payments?: { mst_payment_id?: number | null; amount?: number | null }[];
      zeny?: number | null;
    };
    // Nothing is consumed, so nothing is echoed as consumed: the real equipment,
    // the real payment balances, and the real zenny.
    encryptAndSend(
      {
        base_equipment: {},
        payments: (box.payments ?? []).map((p) => ({
          mst_payment_id: Number(p.mst_payment_id),
          amount: Number(p.amount ?? 0),
        })),
        resource_equipments: [],
        resource_materials: [],
        zeny: Number(box.zeny ?? 0),
      },
      res,
      req,
    );
  } catch (error) {
    log.error('Error in potentialupAutoSet:', error);
    encryptAndSend({}, res, req, ERROR_CODE.GENERIC_ERROR, ERROR_CATEGORY.ERROR_DIALOG, 'Potential up auto set failed');
  }
};

/*
 * Vendita e preferiti. Formati letti dal gioco (libMHS.so, Ghidra):
 * - box/equipment/sale: richiesta { eqp_obj_ids }, risposta
 *   { equip_sell: { zeny, point: { amount, mst_event_point_id }, eqp_obj_ids } }.
 *   sServer::setupBoxEquipmentSaleResponse toglie dalla box ogni pezzo di
 *   eqp_obj_ids e IMPOSTA gli zeny al valore ricevuto (totale, non guadagno).
 * - box/material/sell: richiesta { material: { amount, mst_material_id } },
 *   risposta { zeny, material: { amount, mst_material_id } }. Il gioco cerca
 *   material.mst_material_id nella sua box SENZA controllare che esista: con la
 *   vecchia risposta vuota {} cercava il materiale 0 e andava in crash.
 * - box/equipment/favorite/set: richiesta { is_favorite, eqp_obj_id }, risposta
 *   { favorite_set: { equipment } } col pezzo aggiornato (prima vuoto: crash).
 * Prezzi da prezzi-vendita.json (tools-js/costruisci-prezzi-vendita.cjs, dai
 * file del gioco: mSellValue degli equipaggiamenti, mTradePoint dei materiali).
 */
const PREZZO_EQUIP = (prezziVendita as { e: Record<string, number> }).e;
const PREZZO_MATERIALE = (prezziVendita as { m: Record<string, number> }).m;

function sessioneDa(body: unknown): string | null {
  const s = (body as { session_id?: unknown } | undefined)?.session_id;
  return typeof s === 'string' && s ? s : null;
}

/** equipment_id usati in un set equipaggiamento: non si vendono, il set resterebbe rotto. */
function pezziIndossati(equipset: unknown): Set<string> {
  const usati = new Set<string>();
  for (const m of JSON.stringify(equipset ?? {}).matchAll(/"equipment_id":"([^"]+)"/g)) usati.add(m[1]!);
  return usati;
}

/** Il gioco IMPOSTA l'importo del punto ricevuto: si rimanda un punto gia' posseduto, invariato. */
function puntoInvariato(points: unknown): { amount: number; mst_event_point_id: number } {
  const lista = Array.isArray(points) ? (points as { amount?: number; mst_event_point_id?: number }[]) : [];
  const p = lista.find((x) => x?.mst_event_point_id);
  return p ? { amount: Number(p.amount ?? 0), mst_event_point_id: Number(p.mst_event_point_id) } : { amount: 0, mst_event_point_id: 0 };
}

export const sale = async (req: Request, res: Response) => {
  try {
    const sessione = sessioneDa(req.body);
    if (!sessione) return encryptAndSend({}, res, req, ERROR_CODE.NOT_AUTHENTICATED);
    const ids = (req.body as SaleInput).eqp_obj_ids;
    const richiesti = new Set((Array.isArray(ids) ? ids : []).map(String));
    const doc = await User.findOne({ current_session: sessione });
    if (!doc?.box) return encryptAndSend({}, res, req, ERROR_CODE.NOT_AUTHENTICATED);

    const indossati = pezziIndossati(doc.equipset);
    const venduti: string[] = [];
    let guadagno = 0;
    const restano = (doc.box.equipments ?? []).filter((p) => {
      const id = String(p.equipment_id);
      if (!richiesti.has(id) || p.favorite || indossati.has(id)) return true;
      venduti.push(id);
      guadagno += PREZZO_EQUIP[String(p.mst_equipment_id)] ?? 0;
      return false;
    });
    const zeny = Number(doc.box.zeny ?? 0) + guadagno;
    if (venduti.length) {
      await User.updateOne({ _id: doc._id }, { $set: { 'box.equipments': restano, 'box.zeny': zeny } });
    }
    log.info('vendita equip | %s vende %d pezzi (%d chiesti) per %d zeny, totale %d',
      doc.character_name ?? '?', venduti.length, richiesti.size, guadagno, zeny);
    encryptAndSend({ equip_sell: { zeny, point: puntoInvariato(doc.box.points), eqp_obj_ids: venduti } }, res, req);
  } catch (error) {
    log.error('Error in sale:', error);
    encryptAndSend({}, res, req, ERROR_CODE.GENERIC_ERROR, ERROR_CATEGORY.ERROR_DIALOG, 'Equipment sale failed');
  }
};

export const materialSell = async (req: Request, res: Response) => {
  try {
    const sessione = sessioneDa(req.body);
    if (!sessione) return encryptAndSend({}, res, req, ERROR_CODE.NOT_AUTHENTICATED);
    const richiesta = (req.body as { material?: { amount?: unknown; mst_material_id?: unknown } }).material ?? {};
    const idMateriale = Number(richiesta.mst_material_id);
    const quanti = Math.max(0, Math.floor(Number(richiesta.amount) || 0));
    const doc = await User.findOne({ current_session: sessione });
    if (!doc?.box) return encryptAndSend({}, res, req, ERROR_CODE.NOT_AUTHENTICATED);

    // Le righe doppie dello stesso materiale (nate dal tutorial) vengono unite in una.
    const materiali = doc.box.materials ?? [];
    const suoi = materiali.filter((m) => Number(m.mst_material_id) === idMateriale);
    if (!Number.isFinite(idMateriale) || !suoi.length) {
      // 94 = "The material you tried to sell is not in your Material Box".
      return encryptAndSend({}, res, req, ERROR_CODE.MATERIAL_NOT_IN_BOX_SELL, ERROR_CATEGORY.ERROR_DIALOG, 'Material not found');
    }
    const posseduti = suoi.reduce((t, m) => t + Number(m.amount ?? 0), 0);
    if (quanti > posseduti) {
      // 95 = "You do not have enough of the material you tried to sell".
      return encryptAndSend({}, res, req, ERROR_CODE.MATERIALS_NOT_ENOUGH_SELL, ERROR_CATEGORY.ERROR_DIALOG,
        `素材が足りません (Material not enough: have ${posseduti}, asked ${quanti})`);
    }
    const venduti = Math.min(quanti, posseduti);
    const rimasti = posseduti - venduti;
    const guadagno = venduti * (PREZZO_MATERIALE[String(idMateriale)] ?? 0);
    const zeny = Number(doc.box.zeny ?? 0) + guadagno;
    const altri = materiali.filter((m) => Number(m.mst_material_id) !== idMateriale);
    const nuovi = rimasti > 0 ? [...altri, { mst_material_id: idMateriale, amount: rimasti }] : altri;
    await User.updateOne({ _id: doc._id }, { $set: { 'box.materials': nuovi, 'box.zeny': zeny } });
    log.info('vendita materiale | %s vende %d x %d per %d zeny, ne restano %d',
      doc.character_name ?? '?', venduti, idMateriale, guadagno, rimasti);
    encryptAndSend({ zeny, material: { amount: rimasti, mst_material_id: idMateriale } }, res, req);
  } catch (error) {
    log.error('Error in materialSell:', error);
    encryptAndSend({}, res, req, ERROR_CODE.GENERIC_ERROR, ERROR_CATEGORY.ERROR_DIALOG, 'Material sale failed');
  }
};

export const favoriteSet = async (req: Request, res: Response) => {
  try {
    const sessione = sessioneDa(req.body);
    if (!sessione) return encryptAndSend({}, res, req, ERROR_CODE.NOT_AUTHENTICATED);
    const { is_favorite, eqp_obj_id } = req.body as FavoriteSetInput;
    const doc = await User.findOne({ current_session: sessione });
    if (!doc?.box) return encryptAndSend({}, res, req, ERROR_CODE.NOT_AUTHENTICATED);
    const indice = (doc.box.equipments ?? []).findIndex((p) => String(p.equipment_id) === String(eqp_obj_id));
    if (indice === -1) {
      return encryptAndSend({}, res, req, ERROR_CODE.GENERIC_ERROR, ERROR_CATEGORY.ERROR_DIALOG, 'Equipment not found');
    }
    const valore = Number(is_favorite) ? 1 : 0;
    await User.updateOne({ _id: doc._id }, { $set: { [`box.equipments.${indice}.favorite`]: valore } });
    const pezzo = doc.box.equipments![indice] as unknown as { toObject?: () => Record<string, unknown> } & Record<string, unknown>;
    const equipment: Record<string, unknown> = { ...(typeof pezzo.toObject === 'function' ? pezzo.toObject() : pezzo), favorite: valore };
    delete equipment._id;
    encryptAndSend({ favorite_set: { equipment } }, res, req);
  } catch (error) {
    log.error('Error in favoriteSet:', error);
    encryptAndSend({}, res, req, ERROR_CODE.GENERIC_ERROR, ERROR_CATEGORY.ERROR_DIALOG, 'Set favorite failed');
  }
};

export const leveupAuto = async (req: Request, res: Response) => {
  try {
    const { session_id, type } = req.body as MonumentLevelupInput;
    const filter = { current_session: session_id };
    const doc = await User.findOne(filter);
    if (!doc) {
      return encryptAndSend({}, res, req, ERROR_CODE.NOT_AUTHENTICATED); // Not authenticated
    }
    if (!doc.box?.monument?.mlv) {
      return encryptAndSend({}, res, req, ERROR_CODE.GENERIC_ERROR, ERROR_CATEGORY.ERROR_DIALOG, 'Monument data not found');
    }
    /*
     * Ogni livello consuma 10 輝石 del tipo giusto (la schermata mostra "x N / 10").
     * ID dalla tabella del gioco item_augite. Prima solo 'hp' li consumava e
     * atk/def/sp salivano gratis a ogni chiamata.
     */
    const AUGITE_PER_TIPO: Record<string, number> = { atk: 2483912298, def: 218378192, hp: 2047024966, sp: 3831991013 };
    const NECESSARI = 10;
    const idAugite = AUGITE_PER_TIPO[String(type)];
    const mlv = doc.box.monument.mlv as Record<string, number>;
    if (idAugite === undefined || !(String(type) in mlv)) {
      return encryptAndSend({}, res, req, ERROR_CODE.GENERIC_ERROR, ERROR_CATEGORY.ERROR_DIALOG, 'Unknown monument type');
    }
    const voce = (doc.box.monument.augite ?? []).find((item) => item.mst_augite_id === idAugite);
    if (!voce || (voce.amount ?? 0) < NECESSARI) {
      return encryptAndSend({}, res, req, ERROR_CODE.GENERIC_ERROR, ERROR_CATEGORY.ERROR_DIALOG, 'Not enough augite');
    }
    voce.amount = (voce.amount ?? 0) - NECESSARI;
    mlv[String(type)] = (mlv[String(type)] ?? 0) + 1;
    doc.box.monument.hr = doc.box.monument.hr + 1;
    const update = { box: doc.box };

    await User.findByIdAndUpdate(doc.id, update);
    const data = {
      monument_levelup: {
        capacity: doc.box.capacity,
        monument: doc.box.monument,
      },
    };
    encryptAndSend(data, res, req);
  } catch (error) {
    log.error('Error in leveupAuto:', error);
    encryptAndSend({}, res, req, ERROR_CODE.GENERIC_ERROR, ERROR_CATEGORY.ERROR_DIALOG, 'Monument level up failed');
  }
};
