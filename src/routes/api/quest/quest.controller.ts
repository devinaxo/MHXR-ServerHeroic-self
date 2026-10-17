// Quest Error Codes
// 10001,10002,10003,10005 Failed to get Quest Info other error codes
//10000 Quest Error
//10004 The selected quest is out of session or does not exist
//10006 The quest is already in progress
//10007 Quest not unlocked
import { Request, Response } from 'express';
import { encryptAndSend } from '../../../services/crypto/encryptionHelpers.js';
import { ERROR_CODE, ERROR_CATEGORY } from '../../../constants/error.codes.js';
import { createLogger } from '../../../middleware/logger.js';
const log = createLogger('quest');

import QuestSheet from '../../../model/questSheet.js';
import User from '../../../model/user.js';
import { blocchiPerAvvio } from '../../../services/blocchiQuest.js';
import { applicaRaccolta, salvaRaccolta } from '../../../services/raccoltaQuest.js';
import { salvaOtomoAvviati } from '../../../services/otomoQuest.js';
import { spendiKaridama, saldoKaridama } from '../../../services/karidamaService.js';
import { tempoPerLista } from '../../../services/questTime.js';
import { talismanAbilitatoDaSessione } from '../../../services/talismanService.js';
import type { EternalStartInput } from './quest.schema.js';

interface BlockListItem {
  block_idx: number;
  block_instance_list: { instance_id: number; serial_no: number }[];
  drop_list: never[];
  instance_id: number;
  is_insert: number;
  is_raid: number;
  mst_block_id: number;
  repop_list: { amount: number; serial_no: number }[];
}

export const questProgress = (req: Request, res: Response) => {
  const data = {
    continue_num: 0,
    is_16multi: 0,
    is_multi_play: 0,
    is_progress: -1,
    mst_quest_id: 0,
    quest_instance_id: 0,
    result_step: 0,
  };
  encryptAndSend(data, res, req);
};

export const questResultEnd = (req: Request, res: Response) => {
  const data = {
    //empty in ida
  };
  encryptAndSend(data, res, req);
};

export const eternalStart = async (req: Request, res: Response) => {
  try {
    const { mst_quest_id, power_up, otomo } = req.body as EternalStartInput & { otomo?: unknown };
    const startedQuest = mst_quest_id;
    // Charms are gated per quest: without this the equipped charm's skill and
    // skill orbs are ignored and weapon arts stay locked (services/talismanService).
    const enableTalisman = await talismanAbilitatoDaSessione(
      (req.body as { session_id?: string }).session_id,
    );

    const quest = await QuestSheet.findOne({ mQuestID: String(startedQuest) });
    const data = {
      instance_data: {
        block_list: [] as BlockListItem[],
        bomb_lot_num: [],
        bomb_lottery: [],

        enable_limited_skill_id_list: [],
        enable_partner_limited_skill_id_list: [],
        enable_talisman: enableTalisman,
        enable_talisman_partner: 0,
        enemy_point_list: [],
        instance_id: 0,
        mission_message: 'start',
        mst_quest_id,
        multi_leave_check_time: 0,
        point_info: {
          armor_skill_value: 0,
          campaign_value: 0,
          get_point: 0,
          guild_bingo_bonus: 0,
          guild_total_point: 0,
          m16_get_point: 0,
          mst_event_info_id: 2740334662,
          mst_event_point_id: 2992123464,
          now_point: 0,
          total_point: 0,
        },
        power_up: power_up ?? 0,
        select_fix_equipment_idx: 0,
        subtargets: [{ instance_id: 0, mst_subtarget_id: 0 }],
      },
    };
    const blocks = blocchiPerAvvio(quest);
    if (blocks.length === 0) {
      return encryptAndSend({}, res, req, ERROR_CODE.QUEST_INFO_FAILED);
    }
    blocks.forEach((block, index) => {
      data.instance_data.block_list.push({
        block_idx: index + 1,
        block_instance_list: [
          // { instance_id: 0, serial_no: 1 }
        ],
        drop_list: [],
        instance_id: 0,
        is_insert: 0,
        is_raid: 0,
        mst_block_id: block,
        repop_list: [
          // { amount: 0, serial_no: 0 }
        ],
      });
    });
    // Forzieri del tesoro e punti di raccolta (services/raccoltaQuest.ts).
    const sessione = String((req.body as { session_id?: string }).session_id ?? '');
    const punti = applicaRaccolta(data.instance_data.block_list, quest?.mRewardItemList, `${sessione}:${startedQuest}`);
    await salvaRaccolta((f, u) => User.updateOne(f, u), sessione, startedQuest, punti);
    await salvaOtomoAvviati((f, u) => User.updateOne(f, u), sessione, startedQuest, otomo);
    encryptAndSend(data, res, req);
  } catch (error) {
    log.error('Error in eternalStart:', error);
    encryptAndSend({}, res, req, ERROR_CODE.GENERIC_ERROR, ERROR_CATEGORY.ERROR_DIALOG, 'Eternal start failed');
  }
};

/*
 * Cacce eterne (永劫). La lista era fissa: 20 voci con clear_time 0, quindi il
 * gioco mostrava sempre "99:59". Ora il tempo migliore (0 se mai fatta) e lo
 * stato vengono letti da user.cleared_quests, come fa la mappa delle isole.
 */
const ETERNAL_QUESTS: ReadonlyArray<number> = [
  2574015882, 6622256, 2002926758, 3909527813, 2650904979, 118016041, 1880094911,
  3769689390, 2545407416, 4151336029, 2155310283, 427703665, 1853427175, 4028471364,
  2266671314, 504625512, 1762970110, 4188787823, 2393695481, 3697086366,
];

export const eternalAll = async (req: Request, res: Response) => {
  try {
    const { session_id } = req.body as { session_id?: string };
    const doc = typeof session_id === 'string' && session_id ? await User.findOne({ current_session: session_id }) : null;
    const cleared = doc?.cleared_quests ?? [];
    const eternal_quest_list = ETERNAL_QUESTS.map((mst_quest_id, idx) => {
      const voce = cleared.find((q) => q.mst_quest_id === mst_quest_id);
      const clear_time = tempoPerLista(voce?.clear_time);
      return {
        clear_time,
        idx,
        is_collection_quest: 0,
        is_enable: 1,
        mst_quest_id,
        quest_subtargets: [],
        state: clear_time > 0 ? 3 : 0,
      };
    });
    const data = {
      banner_path: 'ukyu_00100',
      eternal_collection_list: [],
      eternal_nodes: [
        {
          banner_path: 'ukyu_00100',
          eternal_quest_list,
          mst_eternal_node_id: 1,
        },
      ],
    };
    encryptAndSend(data, res, req);
  } catch (error) {
    log.error('Error in eternalAll:', error);
    encryptAndSend({}, res, req, ERROR_CODE.GENERIC_ERROR, ERROR_CATEGORY.ERROR_DIALOG, 'Eternal list failed');
  }
};

/*
 * Continua dopo la sconfitta (quest/continue), pagato in 狩玉.
 * Il prezzo e' quello del gioco: const_data (rServerConstData) continuePrice = 5,
 * letto dal client con sServer::getContinueKaridama. Richiesta: mst_quest_id,
 * quest_instance_id, continue_data; risposta (cAPIQuestContinue::Response, da
 * Ghidra): payments (saldo aggiornato) e continue_num (continua usati).
 * Prima rispondeva vuoto: il gioco ripartiva senza scalare niente.
 */
export const PREZZO_CONTINUA = 5;

export const questContinue = async (req: Request, res: Response) => {
  try {
    const { session_id, mst_quest_id, quest_instance_id } = req.body as { session_id?: string; mst_quest_id?: number; quest_instance_id?: number };
    const doc = await User.findOne({ current_session: session_id });
    if (!doc?.box) {
      return encryptAndSend({}, res, req, ERROR_CODE.NOT_AUTHENTICATED);
    }
    const box = doc.box as unknown as { payments?: { mst_payment_id?: number | null; amount?: number | null }[] };
    if (!spendiKaridama(box, PREZZO_CONTINUA)) {
      // 73 = "Not enough Hunting Orbs" (狩玉) instead of the generic error.
      return encryptAndSend({}, res, req, ERROR_CODE.KARIDAMA_NOT_ENOUGH, ERROR_CATEGORY.ERROR_DIALOG,
        `狩玉が足りません (Not enough karidama: ${saldoKaridama(box.payments)}/${PREZZO_CONTINUA})`);
    }
    // Continua usati: si contano per la stessa quest avviata (stesso quest_instance_id).
    const prima = (doc as unknown as { continua?: { mst_quest_id?: number; quest_instance_id?: number; num?: number } | null }).continua;
    const stessa = prima && Number(prima.mst_quest_id) === Number(mst_quest_id) && Number(prima.quest_instance_id) === Number(quest_instance_id);
    const continua = { mst_quest_id: Number(mst_quest_id), quest_instance_id: Number(quest_instance_id), num: (stessa ? Number(prima!.num) || 0 : 0) + 1 };
    await User.updateOne({ _id: doc._id }, { $set: { 'box.payments': box.payments, continua } });
    log.info('continua | %s paga %d 狩玉 (quest=%s, continua n.%d), saldo %d', doc.character_name ?? '?', PREZZO_CONTINUA, String(mst_quest_id), continua.num, saldoKaridama(box.payments));
    encryptAndSend({
      continue_num: continua.num,
      payments: (box.payments ?? []).map((p) => ({ mst_payment_id: Number(p.mst_payment_id), amount: Number(p.amount ?? 0) })),
    }, res, req);
  } catch (error) {
    log.error('Error in questContinue:', error);
    encryptAndSend({}, res, req, ERROR_CODE.GENERIC_ERROR, ERROR_CATEGORY.ERROR_DIALOG, 'Quest continue failed');
  }
};
