import { Request, Response } from 'express';
import { encryptAndSend } from '../../../services/crypto/encryptionHelpers.js';
import { ERROR_CODE, ERROR_CATEGORY } from '../../../constants/error.codes.js';
import { createLogger } from '../../../middleware/logger.js';
import User from '../../../model/user.js';
import materiali from '../../../json/materiali.json' with { type: 'json' };
import {
  HUNT_FEST_POINT_ID,
  PER_GIOCOATORE,
  SCORTA_TOTALE,
  giaAcquistato,
  registraAcquistoAsync,
  saldoPunti,
} from '../../../services/tradePointsService.js';

const log = createLogger('event');

/*
 * EVENT SHOP (event/shop/list, event/shop/buy).
 *
 * Sono gli endpoint che il client usa davvero per il negozio dell'evento (letti
 * dal binario, libMHS.so):
 *   list req  { session_id, mst_event_info_id }
 *   list resp { event_shop_items[] }         -- nessun `point`, la riga ha gli
 *                                               stessi campi del Trading Post
 *   buy  req  { session_id, amount, mst_event_info_id, mst_shop_item_id }
 *   buy  resp { item_contents, point }
 *
 * La valuta e' Hunt Fest Flag P (HUNT_FEST_POINT_ID), che si guadagna a fine
 * missione sulle isole. Lo scaffale e' nostro: l'event shop originale non
 * e' nei dati che abbiamo, quindi qui si vende un piccolo assortimento di
 * materiali rari e di potenziamento. Gli id vengono SEMPRE da materiali.json,
 * come nel Trading Post: un id inventato scritto in box blocca il login.
 */
const HUNT_FEST_ENABLED = process.env.HUNT_FEST_EVENT !== '0';

/*
 * L'id dell'evento deve combaciare fra /event/info/get e la richiesta dello
 * shop. Il client lo prende dall'entry dell'evento e lo rimanda a
 * event/shop/list. Override: HUNT_FEST_EVENT_INFO_ID.
 */
const HUNT_FEST_EVENT_INFO_ID = Number(process.env.HUNT_FEST_EVENT_INFO_ID ?? 628862266);
// Nodi dell'evento 狩猟祭 (松/竹/梅/秘), da src/json/seev_events.json.
const HUNT_FEST_NODES = [2615915347, 3974923205, 1921521254, 93267696];

interface VoceMateriale {
  id: number;
  nome: string;
  en?: string;
  rarita: number;
}
const CATALOGO = materiali as ReadonlyArray<VoceMateriale>;
const PER_ID = new Map<number, VoceMateriale>(CATALOGO.map((m) => [m.id, m]));

/** Il nostro assortimento dell'evento: id da materiali.json e prezzo in flag. */
const SCAFFALE_EVENTO: ReadonlyArray<{ id: number; prezzo: number }> = [
  { id: 1921761827, prezzo: 5 },  // Enhancement Material (r3)
  { id: 4243365568, prezzo: 10 }, // Enhancement Inro [Purple] (r4)
  { id: 2347478614, prezzo: 10 }, // Enhancement Inro [Yellow] (r4)
  { id: 316866540, prezzo: 10 },  // Enhancement Inro [Azure] (r4)
  { id: 1709559674, prezzo: 10 }, // Enhancement Inro [Crimson] (r4)
  { id: 1183126671, prezzo: 15 }, // Flame Divine Vein (r6)
  { id: 3750511925, prezzo: 15 }, // Aqua Divine Vein (r6)
  { id: 3638657324, prezzo: 25 }, // Flame Divine Palm (r7)
  { id: 2951131578, prezzo: 25 }, // Aqua Divine Palm (r7)
  { id: 1839744844, prezzo: 50 }, // Flame Divine Eye (r8)
  { id: 4104197878, prezzo: 50 }, // Aqua Divine Eye (r8)
];
const PREZZO_PER_ID = new Map(SCAFFALE_EVENTO.map((v) => [v.id, v.prezzo]));

/** Una riga dello shop, nella forma che Event_shop_items si aspetta. */
function rigaEvento(m: VoceMateriale, prezzo: number, giaPresi: number) {
  const contenuto = { materials: [{ amount: 1, mst_material_id: m.id }] };
  const titolo = m.en?.trim() || m.nome;
  return {
    detail: titolo,
    disp_item_contents: contenuto,
    end_remain: 30000,
    filter_type: 0,
    item_contents: contenuto,
    item_limit: Math.max(0, PER_GIOCOATORE - giaPresi),
    item_limit_max: PER_GIOCOATORE,
    mst_shop_item_id: m.id,
    name: titolo,
    price: prezzo,
    shop_limit: Math.max(1, SCORTA_TOTALE - giaPresi),
    shop_limit_max: SCORTA_TOTALE,
    start_remain: 0,
  };
}

export const eventShopList = async (req: Request, res: Response) => {
  try {
    const { session_id, mst_event_info_id } = req.body as { session_id?: string; mst_event_info_id?: number };
    const doc = await User.findOne({ current_session: session_id });
    if (!doc) return encryptAndSend({}, res, req, ERROR_CODE.NOT_AUTHENTICATED);

    const voci = SCAFFALE_EVENTO
      .map(({ id, prezzo }) => {
        const m = PER_ID.get(id);
        return m ? rigaEvento(m, prezzo, giaAcquistato(doc, id)) : null;
      })
      .filter((v): v is ReturnType<typeof rigaEvento> => !!v);

    const saldo = saldoPunti(doc.box, HUNT_FEST_POINT_ID);
    log.info(
      'event shop | %s apre lo shop evento %s: %d voci, saldo %d Hunt Fest Flag P',
      doc.character_name ?? '?', String(mst_event_info_id ?? HUNT_FEST_EVENT_INFO_ID), voci.length, saldo,
    );
    encryptAndSend({ event_shop_items: voci }, res, req);
  } catch (error) {
    log.error('Errore in event/shop/list:', error);
    encryptAndSend({ event_shop_items: [] }, res, req);
  }
};

export const eventShopBuy = async (req: Request, res: Response) => {
  try {
    const { session_id, amount, mst_shop_item_id } = req.body as {
      session_id?: string; amount?: number; mst_shop_item_id?: number;
    };
    const doc = await User.findOne({ current_session: session_id });
    if (!doc) return encryptAndSend({}, res, req, ERROR_CODE.NOT_AUTHENTICATED);

    // Solo id davvero in vetrina: un id fuori catalogo in box rompe il login.
    const m = PER_ID.get(Number(mst_shop_item_id));
    const prezzo = m ? PREZZO_PER_ID.get(m.id) : undefined;
    if (!m || prezzo === undefined) {
      log.info('event shop rifiutato: id %s non e\' in vetrina', String(mst_shop_item_id));
      return encryptAndSend({}, res, req, ERROR_CODE.GENERIC_ERROR, ERROR_CATEGORY.ERROR_DIALOG, 'Oggetto non disponibile');
    }

    const quanti = Math.max(1, Math.min(99, Number(amount) || 1));
    const costo = prezzo * quanti;

    const box = doc.box as unknown as {
      points?: { amount?: number | null; mst_event_point_id?: number | null }[];
      materials?: { amount?: number | null; mst_material_id?: number | null }[];
    };
    if (!box) {
      return encryptAndSend({}, res, req, ERROR_CODE.GENERIC_ERROR, ERROR_CATEGORY.ERROR_DIALOG, 'Inventario assente');
    }

    const giaPresi = giaAcquistato(doc, m.id);
    if (giaPresi + quanti > PER_GIOCOATORE) {
      log.info('event shop rifiutato: %s gia %d/%d per %s', m.en || m.nome, giaPresi, PER_GIOCOATORE, doc.character_name ?? '?');
      return encryptAndSend(
        { point: { amount: saldoPunti(box, HUNT_FEST_POINT_ID), mst_event_point_id: HUNT_FEST_POINT_ID } },
        res, req, ERROR_CODE.ITEMS_NOT_ENOUGH, ERROR_CATEGORY.ERROR_DIALOG,
        `Daily limit reached for ${m.en || m.nome}: ${giaPresi}/${PER_GIOCOATORE}`,
      );
    }

    const saldo = saldoPunti(box, HUNT_FEST_POINT_ID);
    if (saldo < costo) {
      log.info('event shop rifiutato: servono %d flag, ne ha %d', costo, saldo);
      return encryptAndSend(
        { point: { amount: saldo, mst_event_point_id: HUNT_FEST_POINT_ID } },
        res, req, ERROR_CODE.ZENY_NOT_ENOUGH, ERROR_CATEGORY.ERROR_DIALOG,
        `Hunt Fest Flag P insufficient: need ${costo}, have ${saldo}`,
      );
    }

    // Si scala solo dopo aver superato tutti i controlli.
    const riga = (box.points ??= []).find((p) => Number(p.mst_event_point_id) === HUNT_FEST_POINT_ID);
    if (riga) riga.amount = saldo - costo;

    if (!box.materials) box.materials = [];
    const esistente = box.materials.find((x) => Number(x?.mst_material_id) === m.id);
    if (esistente) esistente.amount = Number(esistente.amount ?? 0) + quanti;
    else box.materials.push({ mst_material_id: m.id, amount: quanti });

    doc.markModified('box');
    await registraAcquistoAsync(doc, m.id, quanti);
    await doc.save();

    log.info(
      'event shop | %s compra %s x%d per %d Hunt Fest Flag P (restano %d)',
      doc.character_name ?? '?', m.en || m.nome, quanti, costo, saldo - costo,
    );
    encryptAndSend(
      { item_contents: { materials: [{ amount: quanti, mst_material_id: m.id }] }, point: { amount: saldo - costo, mst_event_point_id: HUNT_FEST_POINT_ID } },
      res, req,
    );
  } catch (error) {
    log.error('Errore in event/shop/buy:', error);
    encryptAndSend({}, res, req, ERROR_CODE.GENERIC_ERROR, ERROR_CATEGORY.ERROR_DIALOG, 'Event buy failed');
  }
};

/*
 * Entry dell'evento 狩猟祭 (Hunter Fest) mostrata in /event/info/get. E' quella
 * che fa comparire l'evento in home e, con mst_event_shop_id, il suo negozio.
 * I campi seguono il template lasciato da upstream (qui sotto, commentato):
 * l'id dell'evento, il punto (Hunt Fest Flag P) e lo shop sono i nostri; il
 * resto e' riempito con valori neutri per non far caricare partite/drama che
 * non esistono. Si disattiva con HUNT_FEST_EVENT=0.
 */
const HUNT_FEST_EVENT_INFO = {
  accumulate_rewards: [],
  banner_id: 7002,
  bingo_point_multiplication: 5,
  event_type_id: 6,
  force_howto_reference_time: 2,
  fuel_karidama_recovery_value: 5,
  fuel_max_value: 5,
  fuel_recovery_karidama_amount: 5,
  guild_accumulate_rewards: [],
  guild_stretch_rewards: [],
  guild_stretch_total_point: 0,
  is_guild_event: -1,
  is_display_home: 1,
  loop_random_rewards: { interval: 0, next_random_reward: { next_score: 0 }, random_reward_table: [] },
  loop_rewards: { interval: 0, loop_reward_table: [], next_loop_reward: { next_score: 0, reward_id: 0 } },
  loop_start_value: 5,
  m16_meta_normal_node_id: 0,
  mst_event_info_id: HUNT_FEST_EVENT_INFO_ID,
  mst_event_point_id: HUNT_FEST_POINT_ID,
  mst_event_shop_id: 1,
  mst_power_id: 1958874842,
  name: 'Hunt Fest',
  now_fuel: 5,
  open: 0,
  open_remain: 0,
  close: 4102444800,
  close_remain: 999999999,
  end: 4102444800,
  end_remain: 999999999,
  start: 0,
  start_remain: 0,
  opening_mst_drama_id: 0,
  part_extend_ids: [],
  quest_extend_ids: [],
  recovery_fuel_second: 2,
  remain_fuel_full: 4,
  target_event_node_infos: HUNT_FEST_NODES,
  target_forest_quest_id: 0,
  target_lottery_id: 0,
  target_part_infos: [],
  target_score_node_infos: [],
  total_guild_point: 0,
  total_point: 0,
};

export const infoGet = (req: Request, res: Response) => {
  const data = {
    beginner_node_id: [1122664016],
    event_info: [
      ...(HUNT_FEST_ENABLED ? [HUNT_FEST_EVENT_INFO] : []),
      // {
      //   accumulate_rewards: [
      //     // {
      //     //   is_clear: 0,
      //     //   item_list: {
      //     //     //items
      //     //   },
      //     //   reward_id: 0,
      //     //   str_id: 0,
      //     //   limit_enable: 0,
      //     //   other_item_list: {
      //     //     display: [
      //     //       // {
      //     //       //   amount:0,
      //     //       //   mst_display_id:0
      //     //       // }
      //     //     ],
      //     //     remain_time: 0,
      //     //     score: 0,
      //     //   },
      //     // },
      //   ],
      //   banner_id: 40001,
      //   bingo_point_multiplication: 5,
      //   event_type_id: 6,   //6 = Genki
      //   force_howto_reference_time: 2,
      //   fuel_karidama_recovery_value: 5,
      //   fuel_max_value: 5,
      //   fuel_recovery_karidama_amount: 5,
      //   guild_accumulate_rewards: [
      //     // {
      //     //   is_clear: 0,
      //     //   item_list: {
      //     //     //items
      //     //   },
      //     //   reward_id: 0,
      //     //   str_id: 0,
      //     //   limit_enable: 0,
      //     //   other_item_list: {
      //     //     display: [
      //     //       // {
      //     //       //   amount:0,
      //     //       //   mst_display_id:0
      //     //       // }
      //     //     ],
      //     //     remain_time: 0,
      //     //     score: 0,
      //     //   },
      //     // },
      //   ],
      //   guild_stretch_rewards: [
      //     // {
      //     //   is_clear: 0,
      //     //   item_list: {
      //     //     //items
      //     //   },
      //     //   reward_id: 0,
      //     //   str_id: 0,
      //     //   limit_enable: 0,
      //     //   other_item_list: {
      //     //     display: [
      //     //       // {
      //     //       //   amount:0,
      //     //       //   mst_display_id:0
      //     //       // }
      //     //     ],
      //     //     remain_time: 0,
      //     //     score: 0,
      //     //   },
      //     // },
      //   ],
      //   guild_stretch_total_point: 0,
      //   is_guild_event: -1,
      //   loop_random_rewards: {
      //     interval: 0,
      //     next_random_reward: {
      //       next_score: 0,
      //     },
      //     random_reward_table: [
      //       // {
      //       //   item_list:{},
      //       //   reward_id:0
      //       //   str_id:0
      //       // }
      //     ],
      //   },
      //   loop_rewards: {
      //     interval: 0,
      //     loop_reward_table: [
      //       // {
      //       //   item_list:{},
      //       //   reward_id:0
      //       // }
      //     ],
      //     next_loop_reward: {
      //       next_score: 0,
      //       reward_id: 0,
      //     },
      //   },
      //   loop_start_value: 5,
      //   m16_meta_normal_node_id: 0,
      //   mst_event_info_id: 628862266, //controls the event  (eventHome.xml) if (mIsDisplayHome == true) then it displays a button for monster //also populates the url  id
      //   mst_event_point_id: 4081529372, //point type for event
      //   mst_event_shop_id: 1,   //TODO find out how to trigger shop
      //   mst_power_id: 1958874842,
      //   name: "Event Name",
      //   now_fuel: 5,
      //   open: 0,
      //   open_remain: 0,
      //   close: 3600,  //epoch time
      //   close_remain: 3600, //mili seconds
      //   end: 3600,    //epoch time
      //   end_remain: 3600,  //mili seconds
      //   start: 0,
      //   start_remain: 0,
      //   opening_mst_drama_id: 2596409178, //plays cutscene before entering....
      //   part_extend_ids: [2200962261], //numbers
      //   quest_extend_ids: [2200962261], //numbers
      //   recovery_fuel_second: 2,
      //   remain_fuel_full: 4,
      //   target_event_node_infos: [3424126991], //numbers
      //   target_forest_quest_id: 2200962261,
      //   target_lottery_id: 1,
      //   target_part_infos: [2200962261], //numbers
      //   target_score_node_infos: [], //numbers
      //   total_guild_point: 23,
      //   total_point: 24,
      // },
    ],
    total_event_point_info: [
      {
        amount: 20,
        mst_event_point_id: 898968147,
      },
    ],
  };
  encryptAndSend(data, res, req);
};

export const limitedskillGet = (req: Request, res: Response) => {
  const data = {
    limited_skill_excl_ev_infos: [],
    limited_skill_infos: [],
  };
  encryptAndSend(data, res, req);
};
