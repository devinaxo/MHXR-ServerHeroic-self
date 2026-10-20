import { Request, Response } from 'express';
import { encryptAndSend } from '../../../services/crypto/encryptionHelpers.js';
import { ERROR_CODE, ERROR_CATEGORY } from '../../../constants/error.codes.js';
import { createLogger } from '../../../middleware/logger.js';
import User from '../../../model/user.js';
import { calcMstId as _calcMstId } from '../../../services/defineService.js';
import prezziVendita from '../../../json/prezzi-vendita.json' with { type: 'json' };
import COSTI from '../../../json/upgrade-costs.json' with { type: 'json' };
import POTENZIALI from '../../../json/potential-values.json' with { type: 'json' };
import ARTS from '../../../json/arts-costs.json' with { type: 'json' };
import EVOLVE from '../../../json/evolve-costs.json' with { type: 'json' };
import omamoriData from '../../../json/omamori.json' with { type: 'json' };
import { KARIDAMA_IDS, spendiKaridama } from '../../../services/karidamaService.js';
import { saldiPayments, paymentsDaSalvare } from '../../../services/paymentService.js';
import { expCrescitaPartner, crescitaPerPartner, applicaExpPartner, CRESCITA_PARTNER } from '../../../services/partnerGrow.js';
import { dimenticaSubSkillOtomo, OTOMO_NO_SKILL } from '../../../services/otomoQuest.js';
import { sistemaMercenari } from '../../../services/setMercenari.js';
import type { BoxGetInput, StorageGetInput, EquipLevelupInput, EquipAwakeInput, EquipWSkillupInput, EquipEvolveInput, PotentialupAutoSetInput, PotentialupInput, PotentialupMaterialInput, SaleInput, FavoriteSetInput, MonumentLevelupInput } from './box.schema.js';
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

/**
 * Arts Lv. (`slv`) upgrade cost table (src/json/arts-costs.json). The JSON
 * import is typed from the file itself; see arts-costs.d.ts.
 */
interface TabellaArti {
  zenyByRarity: Record<string, number>;
  byKariwaza: Record<string, { materials: { mst_material_id: number; amount: number }[]; commonUpNum: number }>;
  kariwazaByEquipment: Record<string, number>;
}

/**
 * Evolution table (src/json/evolve-costs.json), generated from the game's
 * evolve_equip master data by tools-js/build-evolve-costs.cjs.
 */
interface TabellaEvoluzioni {
  byEquipment: Record<
    string,
    {
      name: string;
      after: number;
      afterName: string;
      zeny: number;
      afterLevel: number;
      materials: { mst_material_id: number; amount: number }[];
      equipments: { mst_equipment_id: number; minPotential: number }[];
    }
  >;
}

/** A material row in the box. */
interface VoceMateriale {
  mst_material_id?: number | null;
  amount?: number | null;
}

/*
 * Universal upgrade materials (item_define MATERIAL61107 / MATERIAL61108).
 * Both are substituted for the piece's own material set: 強化材 for equipment
 * levels and 共通秘伝書 for Arts levels. Their mCommonUpNum is 99999 in
 * item_material, so ONE unit covers a whole level: the most expensive set in
 * upgrade-costs.json is a few hundred points.
 */
const MATERIALE_RINFORZO = 1921761827; // 強化材 (Upgrade Material)
const MATERIALE_RINFORZO_ARTI = 3795115954; // 共通秘伝書 (Common Secret Manual)

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
    const { session_id, eqp_obj_id, num, is_use_reinforcement } = req.body as EquipLevelupInput;
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
    // One requirement set per level gained. Keeping the levels separate lets
    // the blend mode decide per level whether it needs a reinforcement item.
    const perLivello: { mst_material_id: number; amount: number }[][] = [];
    for (let lv = currentLevel; lv < currentLevel + steps; lv++) {
      const setIdx = ref[lv];
      if (setIdx === undefined || setIdx === -1) continue;
      perLivello.push(
        (tabella.materialSets[String(setIdx)] ?? []).map((m) => ({
          mst_material_id: m.mst_material_id,
          amount: m.amount,
        })),
      );
    }

    // What the player owns, merged: the box often holds the same material on
    // several rows (the tutorial creates duplicates).
    const posseduti = new Map<number, number>();
    for (const m of (doc.box.materials ?? []) as VoceMateriale[]) {
      const id = Number(m.mst_material_id);
      posseduti.set(id, (posseduti.get(id) ?? 0) + Number(m.amount ?? 0));
    }

    /*
     * is_use_reinforcement (from libMHS.so):
     *   0 = the piece's own required materials;
     *   1 = blend: spend the required materials that are owned and fill the
     *       shortfall of each level with one 強化材;
     *   2 = 強化材 only, one per level.
     * Unknown values fall back to 0, so a bad request cannot upgrade for free.
     */
    const tipoMateriale =
      is_use_reinforcement === 1 || is_use_reinforcement === 2 ? is_use_reinforcement : 0;

    const spesa = new Map<number, number>();
    const spendi = (id: number, amount: number) => {
      if (amount > 0) spesa.set(id, (spesa.get(id) ?? 0) + amount);
    };

    if (tipoMateriale === 0) {
      // Normal upgrade: the whole set is required.
      for (const set of perLivello) for (const m of set) spendi(m.mst_material_id, m.amount);
    } else if (tipoMateriale === 1) {
      // Blend: take what is owned, then one reinforcement item for each level
      // that is still short of anything.
      const restanti = new Map(posseduti);
      let rinforzi = 0;
      for (const set of perLivello) {
        let manca = false;
        for (const m of set) {
          const disponibile = restanti.get(m.mst_material_id) ?? 0;
          const uso = Math.min(disponibile, m.amount);
          if (uso > 0) {
            spendi(m.mst_material_id, uso);
            restanti.set(m.mst_material_id, disponibile - uso);
          }
          if (uso < m.amount) manca = true;
        }
        if (manca) rinforzi++;
      }
      if (rinforzi > 0) spendi(MATERIALE_RINFORZO, rinforzi);
    } else {
      // Reinforcement only: one unit per level gained. A level with an empty
      // material set costs nothing, so it does not ask for a reinforcement.
      if (perLivello.length > 0) spendi(MATERIALE_RINFORZO, perLivello.length);
    }

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

    /*
     * Enough of everything? Checked before anything is deducted, so a refusal
     * leaves the box untouched. The spend map is already summed over the levels
     * gained and already includes the reinforcement item when one is needed.
     */
    for (const [id, amount] of spesa) {
      const disponibili = posseduti.get(id) ?? 0;
      if (disponibili < amount) {
        return encryptAndSend(
          { materials: [{ mst_material_id: id, amount: disponibili }] },
          res,
          req,
          ERROR_CODE.MATERIALS_NOT_ENOUGH,
          ERROR_CATEGORY.ERROR_DIALOG,
          `Material ${id}: need ${amount}, have ${disponibili}`,
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
    const perId = new Map<number, number>(posseduti);
    for (const [id, amount] of spesa) perId.set(id, (perId.get(id) ?? 0) - amount);
    doc.box.materials = [...perId.entries()]
      .filter(([, amount]) => amount > 0)
      .map(([mst_material_id, amount]) => ({ mst_material_id, amount }));

    const newLevel = currentLevel + steps;
    equipment.elv = newLevel;

    // Persist
    await User.findByIdAndUpdate(doc.id, { box: doc.box });

    log.info(
      'potenziamento | %s: %s lv%d -> lv%d, zenny %d (saldo %d), materiali %d, rinforzi %d (tipo %d)',
      doc.character_name ?? '?',
      String(equipment.equipment_id),
      currentLevel,
      newLevel,
      zenny,
      Number(doc.box.zeny ?? 0),
      spesa.size,
      spesa.get(MATERIALE_RINFORZO) ?? 0,
      tipoMateriale,
    );

    /*
     * The client's cAPIBoxEquipmentLevelup::Response::setup parses zeny and
     * materials INSIDE the "levelup" group (the parent passed for both keys is
     * the levelup property). They used to be sent at the top level, so the
     * client read neither: it fell back to 999,999,999 zenny and left the
     * material counts untouched. See docs/UPGRADE-COSTS.md.
     *
     * `materials` carries the changed rows only, with the ABSOLUTE amount left:
     * sServer::setupBoxEquipmentLevelupResponse writes it straight into the box
     * row (a consumed-out material must be sent as 0 so its row is cleared).
     */
    const materialiAggiornati = [...spesa.keys()].map((id) => ({
      mst_material_id: id,
      amount: perId.get(id) ?? 0,
    }));

    const data = {
      levelup: {
        equipment: equipment,
        materials: materialiAggiornati,
        zeny: Number(doc.box.zeny ?? 0),
      },
    };

    encryptAndSend(data, res, req);
  } catch (error) {
    log.error('Error in equipLevelup:', error);
    encryptAndSend({}, res, req, ERROR_CODE.GENERIC_ERROR, ERROR_CATEGORY.ERROR_DIALOG, 'Equipment level up failed');
  }
};

/*
 * ARTS LV. UPGRADE (武技強化 / "weapon skill up", box/equipment/wskillup).
 *
 * Client class cAPIBoxEquipmentWSkillup. Request (Request::createProperty in
 * libMHS.so): { base_equipment_id, is_use_reinforcement, num }. Response
 * (Response::createProperty): { zeny, base_equipment, resource_materials },
 * where resource_materials[{ amount, mst_material_id }] are the materials the
 * client has to *subtract* from its workspace (sServer::
 * setupBoxEquipmentWSkillupResponse does `count -= amount`).
 *
 * The weapon's Arts level is the equipment's `slv`. The price comes from the
 * game's own master data, extracted into src/json/arts-costs.json by
 * tools-js/build-arts-costs.cjs:
 *
 *   zeny      = zenyByRarity[weapon rarity] (flat, per composite)
 *   materials = bugiStrengthenNeedMaterialTable row for the weapon's
 *               mKariwazaID (weapon series -> mKariwazaID -> mMaterialRefDataList
 *               -> mMaterialDataList), x1 per step
 *
 * For "Zork the Rush Zero I" (mKariwazaID 2606267074) that row is exactly
 * 5x Twilight Ritual: Zero [Cold Severity] + 20x Monster Claw + 20x Monster
 * Marrow, which is what the client displays.
 *
 * NOT independently verified: how the cost scales when more than one arts level
 * is gained at once (the request's `num`). The set is constant across levels, so
 * this charges `num` sets and `num` zeny bases. The single-step case is the one
 * confirmed against the client display. See docs/ARTS-UPGRADE.md.
 */
export const equipWSkillup = async (req: Request, res: Response) => {
  try {
    const { session_id, base_equipment_id, num, is_use_reinforcement } = req.body as EquipWSkillupInput;
    const doc = await User.findOne({ current_session: session_id });
    if (!doc?.box) {
      return encryptAndSend({}, res, req, ERROR_CODE.NOT_AUTHENTICATED); // Not authenticated
    }

    const equipmentIndex = (doc.box.equipments ?? []).findIndex((eq) => eq.equipment_id === base_equipment_id);
    if (equipmentIndex === -1) {
      return encryptAndSend({}, res, req, ERROR_CODE.EQUIPMENT_NOT_FOUND, ERROR_CATEGORY.NONE, 'equipment not found');
    }
    const equipment = doc.box.equipments![equipmentIndex]!;

    const arti = ARTS as unknown as TabellaArti;
    const kariwaza = arti.kariwazaByEquipment[String(equipment.mst_equipment_id)];
    if (!kariwaza) {
      log.warn('arti | mst_equipment_id %s assente dai costi arti', equipment.mst_equipment_id);
      return encryptAndSend({}, res, req, ERROR_CODE.GENERIC_ERROR, ERROR_CATEGORY.ERROR_DIALOG, 'No arts cost data for this equipment');
    }
    const costo = arti.byKariwaza[String(kariwaza)];
    if (!costo) {
      log.warn('arti | kariwaza %d assente dai costi arti', kariwaza);
      return encryptAndSend({}, res, req, ERROR_CODE.GENERIC_ERROR, ERROR_CATEGORY.ERROR_DIALOG, 'No arts cost data for this equipment');
    }

    const steps = Math.min(100, Math.max(1, num || 1));
    const currentSlv = Number(equipment.slv ?? 0);

    /*
     * is_use_reinforcement, same three modes as the equipment level-up. The
     * Arts equivalent of 強化材 is 共通秘伝書 (item_define MATERIAL61108,
     * mCommonUpNum 99999), so one unit covers a whole step.
     */
    const tipoMateriale =
      is_use_reinforcement === 1 || is_use_reinforcement === 2 ? is_use_reinforcement : 0;

    // One material set per step.
    const perPasso: { mst_material_id: number; amount: number }[][] = [];
    for (let s = 0; s < steps; s++) {
      perPasso.push(
        costo.materials.map((m) => ({
          mst_material_id: m.mst_material_id,
          amount: m.amount,
        })),
      );
    }

    const posseduti = new Map<number, number>();
    for (const m of (doc.box.materials ?? []) as VoceMateriale[]) {
      const id = Number(m.mst_material_id);
      posseduti.set(id, (posseduti.get(id) ?? 0) + Number(m.amount ?? 0));
    }

    const spesa = new Map<number, number>();
    const spendi = (id: number, amount: number) => {
      if (amount > 0) spesa.set(id, (spesa.get(id) ?? 0) + amount);
    };

    if (tipoMateriale === 0) {
      for (const set of perPasso) for (const m of set) spendi(m.mst_material_id, m.amount);
    } else if (tipoMateriale === 1) {
      // Blend: use what is owned, one 共通秘伝書 for each step still short.
      const restanti = new Map(posseduti);
      let rinforzi = 0;
      for (const set of perPasso) {
        let manca = false;
        for (const m of set) {
          const disponibile = restanti.get(m.mst_material_id) ?? 0;
          const uso = Math.min(disponibile, m.amount);
          if (uso > 0) {
            spendi(m.mst_material_id, uso);
            restanti.set(m.mst_material_id, disponibile - uso);
          }
          if (uso < m.amount) manca = true;
        }
        if (manca) rinforzi++;
      }
      if (rinforzi > 0) spendi(MATERIALE_RINFORZO_ARTI, rinforzi);
    } else {
      spendi(MATERIALE_RINFORZO_ARTI, steps);
    }

    // Flat rarity base per step. Rarity comes from the same master table as
    // box/equipment/levelup (upgrade-costs.json).
    const mst = (COSTI as unknown as TabellaCosti).equipment[String(equipment.mst_equipment_id)];
    const baseZeny = Number(arti.zenyByRarity[String(mst?.rarity ?? 0)] ?? 0);
    const zeny = baseZeny * steps;

    const zenyPosseduti = Number(doc.box.zeny ?? 0);
    if (zeny > zenyPosseduti) {
      return encryptAndSend(
        { zeny: zenyPosseduti },
        res,
        req,
        ERROR_CODE.ZENY_NOT_ENOUGH,
        ERROR_CATEGORY.ERROR_DIALOG,
        `Zenny insufficient: need ${zeny}, have ${zenyPosseduti}`,
      );
    }

    // Checked before anything is deducted, so a refusal leaves the box untouched.
    for (const [id, amount] of spesa) {
      const disponibili = posseduti.get(id) ?? 0;
      if (disponibili < amount) {
        return encryptAndSend(
          { materials: [{ mst_material_id: id, amount: disponibili }] },
          res,
          req,
          ERROR_CODE.MATERIALS_NOT_ENOUGH,
          ERROR_CATEGORY.ERROR_DIALOG,
          `Material ${id}: need ${amount}, have ${disponibili}`,
        );
      }
    }

    // Spend, then raise the arts level.
    doc.box.zeny = zenyPosseduti - zeny;

    const perId = new Map<number, number>(posseduti);
    for (const [id, amount] of spesa) perId.set(id, (perId.get(id) ?? 0) - amount);
    doc.box.materials = [...perId.entries()]
      .filter(([, amount]) => amount > 0)
      .map(([mst_material_id, amount]) => ({ mst_material_id, amount }));

    const newSlv = currentSlv + steps;
    equipment.slv = newSlv;

    await User.findByIdAndUpdate(doc.id, { box: doc.box });

    log.info(
      'arti | %s: %s slv%d -> slv%d, zenny %d (saldo %d), materiali %d, rinforzi %d (tipo %d)',
      doc.character_name ?? '?',
      String(equipment.equipment_id),
      currentSlv,
      newSlv,
      zeny,
      Number(doc.box.zeny ?? 0),
      spesa.size,
      spesa.get(MATERIALE_RINFORZO_ARTI) ?? 0,
      tipoMateriale,
    );

    // resource_materials are the materials the client must subtract, so they
    // carry the amount actually spent (see the header comment).
    const data = {
      zeny: Number(doc.box.zeny ?? 0),
      base_equipment: equipment,
      resource_materials: [...spesa.entries()].map(([mst_material_id, amount]) => ({ mst_material_id, amount })),
    };

    encryptAndSend(data, res, req);
  } catch (error) {
    log.error('Error in equipWSkillup:', error);
    encryptAndSend({}, res, req, ERROR_CODE.GENERIC_ERROR, ERROR_CATEGORY.ERROR_DIALOG, 'Equipment arts level up failed');
  }
};

/*
 * EQUIPMENT EVOLUTION (進化 / box/equipment/evolve).
 *
 * Client class cAPIBoxEquipmentEvolve. Request (Request::createProperty):
 *   { base_equipment_id, evolved_mst_equipment_id, resource_equipment_ids }
 * Response (Response::createProperty):
 *   { zeny, base_equipment, resource_equipments, resource_materials }
 *
 * Costs come from the game's own evolve_equip table, extracted into
 * src/json/evolve-costs.json by tools-js/build-evolve-costs.cjs:
 *   - mNeedZeny             flat zenny cost
 *   - mEvolveAfterLevel     level the evolved piece starts at
 *   - mNeedItemHashList     up to four requirements, either a material id
 *                           (value = amount) or an equipment master id
 *                           (value = the minimum plus value the sacrificed
 *                           copy must have)
 *
 * The client does not send the required materials; it only sends the equipment
 * instances picked for the equipment requirements. The server takes the
 * materials from the table. As with the level-up route, `resource_materials`
 * carries ABSOLUTE amounts (the box rows are written, not added to), and
 * `resource_equipments` carries the sacrificed pieces so the client removes
 * them from the box.
 *
 * An evolution needs the piece at its maximum level. The client already blocks
 * it, but the check is repeated here so a crafted request cannot skip it.
 */
export const equipEvolve = async (req: Request, res: Response) => {
  try {
    const { session_id, base_equipment_id, evolved_mst_equipment_id, resource_equipment_ids } =
      req.body as EquipEvolveInput;
    const doc = await User.findOne({ current_session: session_id });
    if (!doc?.box) {
      return encryptAndSend({}, res, req, ERROR_CODE.NOT_AUTHENTICATED);
    }

    const equipments = doc.box.equipments ?? [];
    const index = equipments.findIndex((e) => String(e.equipment_id) === String(base_equipment_id));
    if (index === -1) {
      return encryptAndSend({}, res, req, ERROR_CODE.EQUIPMENT_NOT_FOUND, ERROR_CATEGORY.NONE, 'equipment not found');
    }
    const eq = equipments[index]!;

    const tabella = EVOLVE as unknown as TabellaEvoluzioni;
    const riga = tabella.byEquipment[String(eq.mst_equipment_id)];
    if (!riga) {
      log.warn('evoluzione | mst_equipment_id %s assente dalla tabella', eq.mst_equipment_id);
      return encryptAndSend({}, res, req, ERROR_CODE.GENERIC_ERROR, ERROR_CATEGORY.ERROR_DIALOG, 'No evolution data for this equipment');
    }

    // The client picked a target; make sure it is the one the table says.
    if (evolved_mst_equipment_id && Number(evolved_mst_equipment_id) !== riga.after) {
      log.warn('evoluzione | %s: target %s inatteso (tabella %d)', eq.equipment_id, evolved_mst_equipment_id, riga.after);
      return encryptAndSend({}, res, req, ERROR_CODE.GENERIC_ERROR, ERROR_CATEGORY.ERROR_DIALOG, 'Wrong evolution target');
    }

    // Evolution is only available at the piece's maximum level.
    const mst = (COSTI as unknown as TabellaCosti).equipment[String(eq.mst_equipment_id)];
    const levelMax = Number(mst?.levelMax ?? 0);
    if (levelMax > 0 && Number(eq.elv ?? 0) < levelMax) {
      return encryptAndSend(
        {},
        res,
        req,
        ERROR_CODE.EQUIP_MAX_LEVEL,
        ERROR_CATEGORY.ERROR_DIALOG,
        `Evolution needs level ${levelMax}, piece is level ${Number(eq.elv ?? 0)}`,
      );
    }

    const zeny = Number(riga.zeny ?? 0);
    const zenyPosseduti = Number(doc.box.zeny ?? 0);
    if (zeny > zenyPosseduti) {
      return encryptAndSend(
        { zeny: zenyPosseduti },
        res,
        req,
        ERROR_CODE.ZENY_NOT_ENOUGH,
        ERROR_CATEGORY.ERROR_DIALOG,
        `Zenny insufficient: need ${zeny}, have ${zenyPosseduti}`,
      );
    }

    // Owned materials, merged (the box can hold duplicate rows).
    const posseduti = new Map<number, number>();
    for (const m of (doc.box.materials ?? []) as VoceMateriale[]) {
      const id = Number(m.mst_material_id);
      posseduti.set(id, (posseduti.get(id) ?? 0) + Number(m.amount ?? 0));
    }
    for (const need of riga.materials) {
      const disponibili = posseduti.get(need.mst_material_id) ?? 0;
      if (disponibili < need.amount) {
        return encryptAndSend(
          { materials: [{ mst_material_id: need.mst_material_id, amount: disponibili }] },
          res,
          req,
          ERROR_CODE.MATERIALS_NOT_ENOUGH,
          ERROR_CATEGORY.ERROR_DIALOG,
          `Material ${need.mst_material_id}: need ${need.amount}, have ${disponibili}`,
        );
      }
    }

    /*
     * Equipment requirements. Each entry asks for ONE instance of a master id
     * with at least minPotential plus value. `resource_equipment_ids` is what
     * the player selected; it must match the requirements exactly, so an
     * unrelated piece can never be eaten by mistake.
     */
    const ids = [...new Set((resource_equipment_ids ?? []).map(String))].filter(
      (id) => id !== String(base_equipment_id),
    );
    if (ids.length !== (resource_equipment_ids ?? []).length) {
      return encryptAndSend({}, res, req, ERROR_CODE.GENERIC_ERROR, ERROR_CATEGORY.ERROR_DIALOG, 'Duplicate resource equipment');
    }
    const candidati = ids.map((id) => equipments.find((e) => String(e.equipment_id) === id));
    if (candidati.some((e) => !e)) {
      return encryptAndSend({}, res, req, ERROR_CODE.EQUIP_NOT_IN_BOX, ERROR_CATEGORY.ERROR_DIALOG, 'Resource equipment not in box');
    }
    const disponibili = candidati.filter((e): e is (typeof equipments)[number] => !!e);
    const usati = new Set<string>();
    const consumati: typeof disponibili = [];
    for (const need of riga.equipments) {
      const scelto = disponibili.find(
        (e) =>
          !usati.has(String(e.equipment_id)) &&
          Number(e.mst_equipment_id) === need.mst_equipment_id &&
          Number(e.potential ?? 0) >= need.minPotential,
      );
      if (!scelto) {
        return encryptAndSend(
          {},
          res,
          req,
          ERROR_CODE.EQUIP_UPGRADE_FAILED,
          ERROR_CATEGORY.ERROR_DIALOG,
          `Evolution needs equipment ${need.mst_equipment_id} with plus value ${need.minPotential}`,
        );
      }
      usati.add(String(scelto.equipment_id));
      consumati.push(scelto);
    }
    if (usati.size !== disponibili.length) {
      return encryptAndSend({}, res, req, ERROR_CODE.GENERIC_ERROR, ERROR_CATEGORY.ERROR_DIALOG, 'Unexpected resource equipment');
    }

    // Everything checked out: spend.
    doc.box.zeny = zenyPosseduti - zeny;

    const spesa = new Map<number, number>();
    for (const need of riga.materials) {
      spesa.set(need.mst_material_id, (spesa.get(need.mst_material_id) ?? 0) + need.amount);
    }
    const perId = new Map<number, number>(posseduti);
    for (const [id, amount] of spesa) perId.set(id, (perId.get(id) ?? 0) - amount);
    doc.box.materials = [...perId.entries()]
      .filter(([, amount]) => amount > 0)
      .map(([mst_material_id, amount]) => ({ mst_material_id, amount }));

    doc.box.equipments = equipments.filter((e) => !usati.has(String(e.equipment_id)));

    // Evolve the piece in place: same equipment_id, new master id and level.
    // The game resets the Arts level on evolution ("武技Lv.が初期化されます").
    const prima = Number(eq.mst_equipment_id);
    eq.mst_equipment_id = riga.after;
    eq.elv = riga.afterLevel > 0 ? riga.afterLevel : Number(eq.elv ?? 0);
    eq.slv = 1;

    await User.findByIdAndUpdate(doc.id, { box: doc.box });

    log.info(
      'evoluzione | %s: %s %d -> %d (lv %d), zenny %d (saldo %d), materiali %d, equipaggiamenti %d',
      doc.character_name ?? '?',
      String(eq.equipment_id),
      prima,
      riga.after,
      Number(eq.elv ?? 0),
      zeny,
      Number(doc.box.zeny ?? 0),
      riga.materials.length,
      consumati.length,
    );

    const materialiAggiornati = [...spesa.keys()].map((id) => ({
      mst_material_id: id,
      amount: perId.get(id) ?? 0,
    }));

    encryptAndSend(
      {
        zeny: Number(doc.box.zeny ?? 0),
        base_equipment: eq,
        resource_equipments: consumati,
        resource_materials: materialiAggiornati,
      },
      res,
      req,
    );
  } catch (error) {
    log.error('Error in equipEvolve:', error);
    encryptAndSend({}, res, req, ERROR_CODE.GENERIC_ERROR, ERROR_CATEGORY.ERROR_DIALOG, 'Equipment evolution failed');
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
 * PLUS VALUE (プラス値): box/equipment/potentialupmaterial and
 * box/equipment/potentialup.
 *
 * The weapon/armour `potential` field is its plus value. It raises the weapon's
 * damage multiplier and is capped by rarity. Both endpoints were missing (only
 * potentialup/auto/set existed, as a stub); the request/response fields were read
 * from libMHS.so:
 *   potentialupmaterial  req { base_equipment_id, resource_materials }
 *                        resp { zeny, base_equipment, resource_materials }
 *   potentialup          req { base_equipment_id, resource_equipment_ids }
 *                        resp { zeny, base_equipment, resource_equipments }
 *
 * The caps and the per-unit values come from the game's own table,
 * rsdnt_equip.arc :: potentialValue (see src/json/potential-values.json and
 * tools-js/costruisci-potential-values.cjs):
 *   mMaxPlusValue     the cap per rarity (r1 5, r2 10, r3 15, r4+ 20/25)
 *   mUpValueList      [equipment value, material value] = [5, 1]
 *   mStrengthBasePrice zeny base
 * The client helper sPlayer::getEquipPotentialValue(rarity, count, kind) is
 * mUpValueList[kind] * count, so one fodder equipment adds 5 and one plus-up
 * material adds 1. The same table names the only materials the client will let
 * you feed (item_plusup_material; 50 zeny each).
 */
interface TabellaPotenziali {
  byRarity: Record<string, { prezzoBase: number; maxPlus: number; upValue: number[] }>;
  materials: Record<string, { rarita: number; zeny: number; condizione: number }>;
}

const PLUS = POTENZIALI as unknown as TabellaPotenziali;

/** Rarity of an equipment, from the same master table the upgrades use. */
function raritaEquipaggiamento(mstEquipmentId: unknown): number {
  return Number((COSTI as unknown as TabellaCosti).equipment[String(mstEquipmentId)]?.rarity ?? 0);
}

/**
 * Plus value with plus-up materials. Each material adds `upValue[1]` (1) and
 * costs its own mZeny (50), capped at the rarity's max.
 */
export const potentialupMaterial = async (req: Request, res: Response) => {
  try {
    const { session_id, base_equipment_id, resource_materials } = req.body as PotentialupMaterialInput;
    const doc = await User.findOne({ current_session: session_id });
    if (!doc?.box) {
      return encryptAndSend({}, res, req, ERROR_CODE.NOT_AUTHENTICATED);
    }

    const equipments = doc.box.equipments ?? [];
    const eq = equipments.find((e) => String(e.equipment_id) === String(base_equipment_id));
    if (!eq) {
      return encryptAndSend({}, res, req, ERROR_CODE.EQUIPMENT_NOT_FOUND, ERROR_CATEGORY.NONE, 'equipment not found');
    }

    const rarita = raritaEquipaggiamento(eq.mst_equipment_id);
    const riga = PLUS.byRarity[String(rarita)];
    if (!riga) {
      return encryptAndSend({}, res, req, ERROR_CODE.GENERIC_ERROR, ERROR_CATEGORY.ERROR_DIALOG, 'No potential value data for this rarity');
    }

    const attuale = Number(eq.potential ?? 0);
    if (attuale >= riga.maxPlus) {
      return encryptAndSend({}, res, req, ERROR_CODE.GENERIC_ERROR, ERROR_CATEGORY.ERROR_DIALOG, 'Plus value already at maximum');
    }

    // Normalise the request: only real ids, positive amounts.
    const richiesti = (resource_materials ?? [])
      .map((m) => ({ mst_material_id: Number(m.mst_material_id), amount: Math.max(0, Number(m.amount) || 0) }))
      .filter((m) => m.mst_material_id > 0 && m.amount > 0);
    if (!richiesti.length) {
      return encryptAndSend({}, res, req, ERROR_CODE.GENERIC_ERROR, ERROR_CATEGORY.ERROR_DIALOG, 'No materials selected');
    }

    let unita = 0;
    let zeny = 0;
    for (const r of richiesti) {
      const info = PLUS.materials[String(r.mst_material_id)];
      if (!info) {
        log.info('plus | id %s non e\' un materiale plus', r.mst_material_id);
        return encryptAndSend({}, res, req, ERROR_CODE.GENERIC_ERROR, ERROR_CATEGORY.ERROR_DIALOG, `Not a plus-up material: ${r.mst_material_id}`);
      }
      unita += r.amount;
      zeny += info.zeny * r.amount;
    }

    // Ownership checked before anything is deducted.
    for (const r of richiesti) {
      const posseduti = ((doc.box.materials ?? []) as VoceMateriale[])
        .filter((m) => Number(m.mst_material_id) === r.mst_material_id)
        .reduce((tot, m) => tot + Number(m.amount ?? 0), 0);
      if (posseduti < r.amount) {
        return encryptAndSend(
          { materials: [{ mst_material_id: r.mst_material_id, amount: posseduti }] },
          res, req, ERROR_CODE.MATERIALS_NOT_ENOUGH, ERROR_CATEGORY.ERROR_DIALOG,
          `Material ${r.mst_material_id}: need ${r.amount}, have ${posseduti}`,
        );
      }
    }

    const zenyPosseduti = Number(doc.box.zeny ?? 0);
    if (zeny > zenyPosseduti) {
      return encryptAndSend(
        { zeny: zenyPosseduti },
        res, req, ERROR_CODE.ZENY_NOT_ENOUGH, ERROR_CATEGORY.ERROR_DIALOG,
        `Zenny insufficient: need ${zeny}, have ${zenyPosseduti}`,
      );
    }

    doc.box.zeny = zenyPosseduti - zeny;

    const perId = new Map<number, number>();
    for (const m of (doc.box.materials ?? []) as VoceMateriale[]) {
      const id = Number(m.mst_material_id);
      perId.set(id, (perId.get(id) ?? 0) + Number(m.amount ?? 0));
    }
    for (const r of richiesti) perId.set(r.mst_material_id, (perId.get(r.mst_material_id) ?? 0) - r.amount);
    doc.box.materials = [...perId.entries()]
      .filter(([, amount]) => amount > 0)
      .map(([mst_material_id, amount]) => ({ mst_material_id, amount }));

    const guadagno = unita * (riga.upValue[1] ?? 1);
    eq.potential = Math.min(riga.maxPlus, attuale + guadagno);

    await User.findByIdAndUpdate(doc.id, { box: doc.box });

    log.info(
      'plus | %s: %s potential %d -> %d (%d materiali), zeny %d (saldo %d)',
      doc.character_name ?? '?', String(eq.equipment_id), attuale, Number(eq.potential), unita, zeny, Number(doc.box.zeny ?? 0),
    );

    encryptAndSend(
      {
        zeny: Number(doc.box.zeny ?? 0),
        base_equipment: eq,
        // The materials the client must subtract; the amounts actually spent.
        resource_materials: richiesti.map((m) => ({ mst_material_id: m.mst_material_id, amount: m.amount })),
      },
      res, req,
    );
  } catch (error) {
    log.error('Error in potentialupMaterial:', error);
    encryptAndSend({}, res, req, ERROR_CODE.GENERIC_ERROR, ERROR_CATEGORY.ERROR_DIALOG, 'Potential up failed');
  }
};

/**
 * Plus value with fodder equipment. Each fodder adds `upValue[0]` (5), capped
 * at the rarity's max. The fodder is consumed. Feeding equipment costs its own
 * `prezzoBase` in zeny.
 */
export const potentialup = async (req: Request, res: Response) => {
  try {
    const { session_id, base_equipment_id, resource_equipment_ids } = req.body as PotentialupInput;
    const doc = await User.findOne({ current_session: session_id });
    if (!doc?.box) {
      return encryptAndSend({}, res, req, ERROR_CODE.NOT_AUTHENTICATED);
    }

    const equipments = doc.box.equipments ?? [];
    const eq = equipments.find((e) => String(e.equipment_id) === String(base_equipment_id));
    if (!eq) {
      return encryptAndSend({}, res, req, ERROR_CODE.EQUIPMENT_NOT_FOUND, ERROR_CATEGORY.NONE, 'equipment not found');
    }

    const rarita = raritaEquipaggiamento(eq.mst_equipment_id);
    const riga = PLUS.byRarity[String(rarita)];
    if (!riga) {
      return encryptAndSend({}, res, req, ERROR_CODE.GENERIC_ERROR, ERROR_CATEGORY.ERROR_DIALOG, 'No potential value data for this rarity');
    }

    const attuale = Number(eq.potential ?? 0);
    if (attuale >= riga.maxPlus) {
      return encryptAndSend({}, res, req, ERROR_CODE.GENERIC_ERROR, ERROR_CATEGORY.ERROR_DIALOG, 'Plus value already at maximum');
    }

    // Only fodder actually in the box, never the base, never twice.
    const ids = [...new Set((resource_equipment_ids ?? []).map(String))].filter((id) => id && id !== String(base_equipment_id));
    const rimossi = equipments.filter((e) => ids.includes(String(e.equipment_id)));
    if (!rimossi.length) {
      return encryptAndSend({}, res, req, ERROR_CODE.GENERIC_ERROR, ERROR_CATEGORY.ERROR_DIALOG, 'No equipment selected');
    }

    const zeny = riga.prezzoBase * rimossi.length;
    const zenyPosseduti = Number(doc.box.zeny ?? 0);
    if (zeny > zenyPosseduti) {
      return encryptAndSend(
        { zeny: zenyPosseduti },
        res, req, ERROR_CODE.ZENY_NOT_ENOUGH, ERROR_CATEGORY.ERROR_DIALOG,
        `Zenny insufficient: need ${zeny}, have ${zenyPosseduti}`,
      );
    }

    const guadagno = rimossi.length * (riga.upValue[0] ?? 5);
    eq.potential = Math.min(riga.maxPlus, attuale + guadagno);
    doc.box.zeny = zenyPosseduti - zeny;
    doc.box.equipments = equipments.filter((e) => !ids.includes(String(e.equipment_id)));

    await User.findByIdAndUpdate(doc.id, { box: doc.box });

    log.info(
      'plus | %s: %s potential %d -> %d (%d pezzi divorati), zeny %d (saldo %d)',
      doc.character_name ?? '?', String(eq.equipment_id), attuale, Number(eq.potential), rimossi.length, zeny, Number(doc.box.zeny ?? 0),
    );

    encryptAndSend(
      { zeny: Number(doc.box.zeny ?? 0), base_equipment: eq, resource_equipments: rimossi },
      res, req,
    );
  } catch (error) {
    log.error('Error in potentialup:', error);
    encryptAndSend({}, res, req, ERROR_CODE.GENERIC_ERROR, ERROR_CATEGORY.ERROR_DIALOG, 'Potential up failed');
  }
};

/*
 * "Auto-set" the materials used for potential upgrades (cAPIBoxEquipmentPotentialupAutoSet).
 *
 * Request `eqp_obj_infos`, response `set_equipments` (from libMHS.so). The
 * manual upgrade is implemented (potentialup / potentialupmaterial, above); the
 * auto-selection itself is not, so this answers an empty, valid set: the player
 * picks the fodder/materials by hand. Better an empty set than a wrong one.
 *
 * It used to return a fully invented payload: equipment "EQP_ABC123", a fake
 * partner payment, made-up materials, and `zeny: 999999`. The client applies the
 * zenny value, so the on-screen balance jumped to 999999999 after touching this
 * screen and only snapped back on the next request that re-read the real box.
 * The response now carries no zeny at all.
 */
export const potentialupAutoSet = async (req: Request, res: Response) => {
  try {
    const sessione = sessioneDa(req.body);
    const doc = sessione ? await User.findOne({ current_session: sessione }) : null;
    if (!doc?.box) {
      return encryptAndSend({}, res, req, ERROR_CODE.NOT_AUTHENTICATED);
    }
    // No auto-selection yet: an empty, valid set (the manual endpoints above do
    // the work). No zeny in the response, so the client cannot be tricked into
    // showing a balance that is not real.
    encryptAndSend({ set_equipments: [] }, res, req);
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
