import { fileURLToPath } from 'node:url';
import path from 'path';
import { Request, Response } from 'express';

const __dirname = import.meta.dirname ?? fileURLToPath(new URL('.', import.meta.url));
import { encryptAndSend } from '../../../services/crypto/encryptionHelpers.js';
import { ERROR_CODE, ERROR_CATEGORY } from '../../../constants/error.codes.js';
import { createLogger } from '../../../middleware/logger.js';
import User from '../../../model/user.js';
const log = createLogger('quest');

import full_island from '../../../json/full_enabled_state.json' with { type: 'json' };
import catalogoRicompense from '../../../json/catalogo-ricompense.json' with { type: 'json' };

import { readFile } from 'fs/promises';

import QuestSheet from '../../../model/questSheet.js';
import { blocchiPerAvvio } from '../../../services/blocchiQuest.js';
import { applicaRaccolta, salvaRaccolta, raccoltoDaiBlocchi, type PuntoAvviato } from '../../../services/raccoltaQuest.js';
import { tesoroDelBlocco } from '../../../services/tesoriIsole.js';
import { mappaProgressiva, missioniCompletate, isolaDiQuest } from '../../../services/progressioneStoria.js';
import { aggiungiKaridama, saldoKaridama, spendiKaridama, KARIDAMA_A_MISSIONE, KARIDAMA_PRINCIPALE } from '../../../services/karidamaService.js';
import { CRESCITA_PARTNER } from '../../../services/partnerGrow.js';
import { talismanAbilitato } from '../../../services/talismanService.js';
import {
  PUNTI_PER_QUEST,
  PUNTI_PER_RISCATTO,
  TRADE_POINT_ID,
  HUNT_FEST_POINT_ID,
  aggiungiPunti,
  giornoGioco,
} from '../../../services/tradePointsService.js';
import { tempoPerLista } from '../../../services/questTime.js';
import { registraOtomoAvviati, premiaOtomoFineQuest, otomoIdsSquadraSelezionata } from '../../../services/otomoQuest.js';
import { estraiOtomoIncontro, creaOtomoIncontro } from '../../../services/otomoEncounter.js';
import { intervalloEnv, interoCasuale } from '../../../services/intervalloEnv.js';
import Present from '../../../model/presents.js';
import specialRequests from '../../../json/special-requests.json' with { type: 'json' };
import type { IslandStartInput, IslandEndInput, IslandMapAllInput } from './quest.schema.js';

/**
 * ID delle missioni "特別依頼" (Special Request / subjugation). Le loro ricompense
 * il gioco non le mette nella cassa a fine caccia: le spedisce al box dei
 * regali ("依頼達成の報酬が送られてきました"). Elenco estratto da
 * rsdnt_map.arc :: node_info.mSubjugationQuestList
 * (tools-js/... vedi src/json/special-requests.json).
 */
const SPECIAL_REQUESTS = new Set<number>((specialRequests as number[]).map(Number));

/*
 * Quest -> island (mst_part_id), from the full map data. `progressione-storia`
 * only lists a node's MAIN quests; the Special Request (subjugation) quests such
 * as 3-9/3-10 are not there, so finishing one of them fell back to island 1 and
 * dropped the player back on the first island. full_island has every quest.
 */
const ISOLA_PER_QUEST: Map<number, number> = (() => {
  const m = new Map<number, number>();
  const oceani = full_island as unknown as { part_list?: { mst_part_id: number; node_list?: { day_quest_list?: { mst_quest_id?: number }[]; night_quest_list?: { mst_quest_id?: number }[] }[] }[] }[];
  for (const o of oceani) {
    for (const p of o.part_list ?? []) {
      for (const n of p.node_list ?? []) {
        for (const q of [...(n.day_quest_list ?? []), ...(n.night_quest_list ?? [])]) {
          if (q.mst_quest_id != null) m.set(Number(q.mst_quest_id), p.mst_part_id);
        }
      }
    }
  }
  return m;
})();

/** L'isola di una missione: prima la mappa completa, poi la progressione. */
function isolaDellaMissione(questId: number): number | null {
  return ISOLA_PER_QUEST.get(questId) ?? isolaDiQuest(questId);
}

/*
 * RICHIESTE DI SOTTOMISSIONE (討伐依頼). Una scena di storia puo' chiedere al
 * giocatore di andare a cacciare in un altro nodo, con il markup
 * <POP1 tipo, NODO> (es. la richiesta di Abigail: <POP1 8,PART00002_NODE00103>).
 * Fintanto che quel nodo non e' stato "esaudito" la scena resta sulla prima
 * parte (la richiesta); una volta esaudito il client deve passare alla parte
 * finale. src/json/story-requests.json (generato dai GMD del gioco) ci dice:
 *   requests: scena -> { target, block, part }   (una richiesta per la sua parte)
 *   blocks:   blocco -> [parti in ordine]        (per trovare la parte finale)
 */
import storyRequests from '../../../json/story-requests.json' with { type: 'json' };

const RICHIESTE = storyRequests.requests as ReadonlyArray<{ story: number; target: number; block: string; part: number }>;
const BLOCCHI = storyRequests.blocks as unknown as Record<string, { part: number; story: number }[]>;

/** Per una scena-richiesta: il blocco a cui appartiene e la parte massima con POP. */
const RICHIESTA_PER_STORIA = new Map<number, { block: string; part: number; target: number }>();
/** Nodo bersaglio -> scene che lo richiedono (per sapere se la richiesta e' stata vista). */
const RICHIESTA_PER_NODO = new Map<number, number[]>();
for (const r of RICHIESTE) {
  if (r.story) RICHIESTA_PER_STORIA.set(r.story, { block: r.block, part: r.part, target: r.target });
  if (r.story && r.target) {
    const arr = RICHIESTA_PER_NODO.get(r.target) ?? [];
    arr.push(r.story);
    RICHIESTA_PER_NODO.set(r.target, arr);
  }
}
/** Scena -> blocco e parte, per ogni parte di ogni blocco. */
const BLOCCO_PER_STORIA = new Map<number, { block: string; part: number }>();
/** Blocco -> parti in ordine. */
const PARTI_BLOCCO = new Map<string, { part: number; story: number }[]>();
for (const [block, parti] of Object.entries(BLOCCHI)) {
  const ordinate = [...parti].sort((a, b) => a.part - b.part);
  PARTI_BLOCCO.set(block, ordinate);
  for (const p of ordinate) BLOCCO_PER_STORIA.set(p.story, { block, part: p.part });
}

/**
 * Blocco -> scena di COMPLETAMENTO della richiesta (討伐依頼): la prima parte
 * dopo l'ultima che porta il markup POP. Per un blocco di richiesta le parti
 * sono _01 richiesta, _02 richiesta, _03 "ce l'abbiamo fatta", _04 epilogo: la
 * completamento e' la _03.
 */
const COMPLETAMENTO_BLOCCO = new Map<string, number>();
{
  const ultimaRichiesta = new Map<string, number>();
  for (const r of RICHIESTE) {
    if (!r.story) continue;
    const cur = ultimaRichiesta.get(r.block) ?? -1;
    if (r.part > cur) ultimaRichiesta.set(r.block, r.part);
  }
  for (const [block, parti] of PARTI_BLOCCO) {
    const ultima = ultimaRichiesta.get(block);
    if (ultima == null) continue;
    const dopo = parti.find((p) => p.part > ultima);
    if (dopo) COMPLETAMENTO_BLOCCO.set(block, dopo.story);
  }
}

/*
 * Isola -> scene di consegna (le _02 dei blocchi che hanno una variante _92: sono
 * esattamente le 30 scene con mItemList). Servono per l'OGGETTO del paesaggio:
 * il client ricostruisce gli oggetti dell'isola dalla mappa a ogni caricamento
 * (sQuestWorkspace::createObjectList), quindi la cutscene di consegna da sola non
 * lascia traccia - se il server non rimanda l'oggetto, il ponte/le macerie
 * tornano come prima. Si mostra l'oggetto (mObjectState finale) quando almeno una
 * consegna dell'isola e' stata vista.
 */
const CONSEGNA_PER_ISOLA = new Map<number, number[]>();
{
  const pref2isola = new Map<string, number>();
  const isoleJson = (storyRequests as unknown as { islands?: Record<string, { content: string }[]> }).islands ?? {};
  for (const [isl, parti] of Object.entries(isoleJson)) {
    for (const p of parti) {
      const m = /^(Story_[0-9]+_[0-9]+)_/.exec(p.content);
      if (m) pref2isola.set(m[1]!, Number(isl));
    }
  }
  for (const [block, parti] of Object.entries(BLOCCHI)) {
    if (!parti.some((p) => p.part === 92)) continue;
    const m = /^(Story_[0-9]+_[0-9]+)$/.exec(block);
    const isola = m ? pref2isola.get(m[1]!) : undefined;
    const consegna = parti.find((p) => p.part === 2);
    if (isola != null && consegna?.story) {
      const arr = CONSEGNA_PER_ISOLA.get(isola) ?? [];
      arr.push(consegna.story);
      CONSEGNA_PER_ISOLA.set(isola, arr);
    }
  }
}

/**
 * La scena da mostrare per un nodo: la parte del SUO blocco successiva a quella
 * piu' avanti gia' vista (`storie_viste`). Il client segna come vista ogni parte
 * che riproduce, quindi la progressione e' dentro il blocco: _01 -> _02 -> _03 ->
 * _04. A blocco finito si resta sull'ultima parte (non si torna alla prima,
 * altrimenti la richiesta tornerebbe in loop). NON si salta ad altri blocchi:
 * altrimenti OGNI nodo mostrerebbe l'intera catena dell'isola (scene non ancora
 * sbloccate comprese). Non serve avanzare fra blocchi: la mappa assegna un solo
 * blocco a ciascun nodo-storia (t1 porto, t3 passaggi, t4 uscita), in ordine.
 */
function parteDaMostrare(storyAttuale: number, storieViste: Set<number>, nodiEsauditi: Set<number>): number {
  /*
   * Richiesta di sottomissione (討伐依頼) esaudita: la scena salta alla parte di
   * completamento del blocco (_03). Un tempo lo si otteneva segnando il NODO con
   * state 3, ma nel client lo stato del nodo crea una "event notice" che la
   * routine di cambio isola poi dereferenzia dopo averla liberata (SIGSEGV/SIGBUS
   * su uMap::tqIslandChange -> setVisibleEventNotice). Si avanza quindi con la
   * sola storia, lasciando il nodo al suo state normale.
   */
  const req = RICHIESTA_PER_STORIA.get(storyAttuale);
  if (req && nodiEsauditi.has(req.target) && storieViste.has(storyAttuale)) {
    const fine = COMPLETAMENTO_BLOCCO.get(req.block);
    if (fine) return fine;
  }
  const b = BLOCCO_PER_STORIA.get(storyAttuale);
  if (!b) return storyAttuale;
  const parti = PARTI_BLOCCO.get(b.block);
  if (!parti?.length) return storyAttuale;
  const maxVista = Math.max(0, ...parti.filter((p) => storieViste.has(p.story)).map((p) => p.part));
  const prossima = parti.find((p) => p.part > maxVista);
  if (prossima) return prossima.story;
  const ultima = parti[parti.length - 1];
  return ultima ? ultima.story : storyAttuale;
}


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

// --- Types ---
type QuestRow = {
  mQuestID: string;
  mDayNight: string;
  [key: string]: string;
};

type NodeQuestRow = {
  mNodeHash: string;
  mQuestHash: string;
  isCollectionQuest: string;
  isKeyQuest: string;
  [key: string]: string;
};

type QuestSubtargetRow = {
  mQuestID: string;
  mSubTargetID: string;
  mDifficulty: string;
  mFixedItemTableID: string;
  [key: string]: string;
};

// Adjust based on your actual ocean/part/node structure
type QuestObject = {
  clear_time: number;
  is_collection_quest: 0 | 1;
  is_key_quest: 0 | 1;
  mst_quest_id: number;
  quest_subtargets: [];
  state: number;
};

type Node = {
  mst_node_id: number;
  day_quest_list?: QuestObject[];
  night_quest_list?: QuestObject[];
  is_collection_node?: number;
  mst_story_id?: number;
  state?: number;
};

type Part = {
  node_list?: Node[];
  mst_part_id?: number;
  campaign?: { mst_campaign_id: number; remain_time: number }[];
  exploration_note?: {
    note_contents: { mst_note_content_id: number; state: number }[];
    progress: number;
  };
  gingira_node_id?: number;
  object_list?: { mst_object_id: number; state: number }[];
  raid_info?: {
    end_remain: number;
    mst_node_id: number;
    start_remain: number;
  }[];
  silver_bonus?: number;
  state?: number;
};

type Ocean = {
  mst_ocean_id: number;
  part_list: Part[];
};

// --- CSV Parser ---
function parseCsv<T = Record<string, string>>(csv: string): T[] {
  const lines = csv.trim().split('\n');
  const headers = lines.shift()!.split(',');
  return lines.map((line) => {
    const values = line.split(',');
    return Object.fromEntries(headers.map((h, i) => [h, values[i]])) as T;
  });
}

// --- Main Function ---
export async function enrichOceanData(
  oceanData: Ocean[],
  cleared_quests: { mst_quest_id: number; clear_time?: number }[],
  storie_viste: number[] = [],
): Promise<Ocean[]> {
  // Load CSVs in parallel
  const [nodeQuestCsv, questDataCsv, questSubtargetCsv] = await Promise.all([
    readFile(path.resolve(__dirname, '../../../csv/oceans/parts/nodes/2-node-quests.csv'), 'utf8'),
    readFile(path.resolve(__dirname, '../../../csv/questData.csv'), 'utf8'),
    readFile(path.resolve(__dirname, '../../../csv/questSubtargetSet.csv'), 'utf8'),
  ]);

  // Parse CSVs
  const nodeQuests = parseCsv<NodeQuestRow>(nodeQuestCsv);
  const questRows = parseCsv<QuestRow>(questDataCsv);
  const subtargetRows = parseCsv<QuestSubtargetRow>(questSubtargetCsv);

  // Index quest data by quest ID
  const questMap = new Map<number, QuestRow>();
  for (const row of questRows) {
    const questID = Number(row.mQuestID);
    if (!isNaN(questID)) questMap.set(questID, row);
  }

  // Index subtargets by quest ID
  const subtargetMap = new Map<number, QuestSubtargetRow[]>();
  for (const row of subtargetRows) {
    const questID = Number(row.mQuestID);
    if (!isNaN(questID)) {
      if (!subtargetMap.has(questID)) subtargetMap.set(questID, []);
      subtargetMap.get(questID)!.push(row);
    }
  }

  // Index node quests by node hash
  const nodeQuestMap = new Map<number, NodeQuestRow[]>();
  for (const row of nodeQuests) {
    const nodeHash = Number(row.mNodeHash);
    if (!isNaN(nodeHash)) {
      if (!nodeQuestMap.has(nodeHash)) nodeQuestMap.set(nodeHash, []);
      nodeQuestMap.get(nodeHash)!.push(row);
    }
  }

  // Nodi "esauditi": hanno una Special Request (Subjugation) gia' completata.
  // Una scena di storia che puntava a un nodo esaudito puo' passare alla parte finale.
  const nodiEsauditi = new Set<number>();
  for (const [nodeHash, rows] of nodeQuestMap) {
    for (const nq of rows) {
      if (nq.QuestType !== 'Subjugation') continue;
      if (cleared_quests.some((q) => q.mst_quest_id === Number(nq.mQuestHash))) nodiEsauditi.add(nodeHash);
    }
  }
  const storieViste = new Set<number>((storie_viste ?? []).map(Number));
  // Enrich ocean data
  const enrichedOcean = oceanData.map((ocean) => {
    const enrichedParts = ocean.part_list.map((part) => {
      if (!part.node_list) return { ...part };

      const enrichedNodes = part.node_list.map((node) => {
        const nodeID = node.mst_node_id;
        if (isNaN(nodeID)) return { ...node };

        const nodeQuests = nodeQuestMap.get(nodeID) || [];
        const day_quest_list: QuestObject[] = [];
        const night_quest_list: QuestObject[] = [];

        for (const nq of nodeQuests) {
          const questID = Number(nq.mQuestHash);
          const quest = questMap.get(questID);
          if (!quest) continue;

          const clearedQuest = cleared_quests.find((q) => q.mst_quest_id === questID);

          /*
           * Una Special Request (討伐依頼) non va offerta in anticipo: si mostra
           * solo dopo che la scena di storia che la chiede e' stata vista (o se e'
           * gia' stata completata). Prima era selezionabile subito e il giocatore
           * poteva farla prima della richiesta, rompendo la progressione.
           */
          if (nq.QuestType === 'Subjugation' && !clearedQuest) {
            const richieste = RICHIESTA_PER_NODO.get(nodeID) ?? [];
            if (richieste.length && !richieste.some((s) => storieViste.has(s))) continue;
          }

          let state = 1; // default = NEW
          if (clearedQuest) {
            state = clearedQuest.clear_time != null ? 3 : 0; //clear 3 / 0 nothing
          }

          const clearTime = tempoPerLista(clearedQuest?.clear_time);

          const isCollectionQuestFlag = nq.isCollectionQuest === 'true' ? 1 : 0;

          const is_collection_quest = clearTime
            ? isCollectionQuestFlag === 1
              ? 0
              : 1 // invert if clearTime is truthy
            : isCollectionQuestFlag;

          const questObj: QuestObject = {
            clear_time: clearTime,
            is_collection_quest,
            is_key_quest: nq.isKeyQuest === 'true' ? 1 : 0,
            mst_quest_id: questID,
            quest_subtargets: [],
            state: state,
          };

          const timeType = Number(quest.mDayNight);
          if (timeType === 1) {
            day_quest_list.push(questObj);
          } else if (timeType === 2) {
            night_quest_list.push(questObj);
          }
        }

        return {
          ...node,
          day_quest_list,
          night_quest_list,
          // NON si tocca `state`: alzarlo a 3 per una richiesta esaudita creava
          // una "event notice" che faceva crashare la mappa (vedi parteDaMostrare).
          // La scena avanza dentro il suo blocco (una parte per volta) e, per una
          // richiesta esaudita, parteDaMostrare salta alla parte di completamento.
          mst_story_id: parteDaMostrare(Number(node.mst_story_id ?? 0), storieViste, nodiEsauditi),
        };
      });

      return {
        ...part,
        node_list: enrichedNodes,
      };
    });
    return {
      ...ocean,
      part_list: enrichedParts,
    };
  });
  return enrichedOcean;
}

export const islandStart = async (req: Request, res: Response) => {
  try {
    const { mst_quest_id, session_id, power_up, otomo } = req.body as IslandStartInput & { power_up?: number; otomo?: unknown };
    const startedQuest = mst_quest_id;
    const filter = { current_session: session_id };

    const doc = await User.findOne(filter);

    const quest = await QuestSheet.findOne({ mQuestID: String(startedQuest) });

    if (!doc) {
      return encryptAndSend({}, res, req, ERROR_CODE.NOT_AUTHENTICATED); //Not authenticated
    }
    const cleared_quests = doc.cleared_quests;

    const questExists = cleared_quests.some((q) => q.mst_quest_id === startedQuest);

    if (!questExists) {
      log.debug('Inserted Quest as seen');
      cleared_quests.push({ mst_quest_id: startedQuest });
    }

    const update = {
      cleared_quests: cleared_quests,
      // I palico che partono ora prendono l'exp a fine quest (services/otomoQuest.ts).
      otomo_avviati: registraOtomoAvviati(Number(startedQuest), otomo),
    };

    // Await the update so you know it completed
    await User.findOneAndUpdate(filter, update, { new: true });
    const data = {
      instance_data: {
        block_list: [] as BlockListItem[],
        bomb_lot_no: [
          {
            bomb_lottery: [{ bomb_id: 0, weight: 0 }],
          },
        ],
        enable_limited_skill_id_list: [],
        enable_partner_limited_skill_id_list: [],
        enable_talisman: talismanAbilitato(doc),
        enable_talisman_partner: 0,
        enemy_point_list: [
          // {
          //   mst_enemy_id: 1618895799,
          //   point: 0,
          // },
        ],
        instance_id: 0,
        mission_message: 'start',
        mst_quest_id: startedQuest,
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
      if (tesoroDelBlocco(block)) log.info('秘宝 | %s: forziere nel blocco %d (%s)', doc.character_name ?? '?', index + 1, tesoroDelBlocco(block)?.nome);
      data.instance_data.block_list.push({
        block_idx: index + 1,
        block_instance_list: [],
        drop_list: [],
        instance_id: 0,
        is_insert: 0,
        is_raid: 0,
        mst_block_id: block,
        repop_list: [],
      });
    });
    // Forzieri del tesoro e punti di raccolta (services/raccoltaQuest.ts).
    const sessione = String((req.body as { session_id?: string }).session_id ?? '');
    const punti = applicaRaccolta(data.instance_data.block_list, quest?.mRewardItemList, `${sessione}:${startedQuest}`);
    await salvaRaccolta((f, u) => User.updateOne(f, u), sessione, startedQuest, punti);
    encryptAndSend(data, res, req);
  } catch (error) {
    log.error('Error in islandStart:', error);
    encryptAndSend({}, res, req, ERROR_CODE.GENERIC_ERROR, ERROR_CATEGORY.ERROR_DIALOG, 'Island start failed');
  }
};

const MATERIALE_DI_RIPIEGO = 1714092880; // verificato: e' un materiale vero

/*
 * I 5 輝石 (augite) della pietra HR, dalla tabella del gioco
 * rsdnt_property.arc :: item_augite (mAugiteID, mItemNo). mst_monument_type_id
 * e' mItemNo: coincide col 体力の輝石 gia' salvato dalla storia (id 2047024966, tipo 3).
 * Nei dati del gioco non c'e' da dove arrivassero in origine; per scelta del
 * gestore del server (29/09) se ne da' un po' a ogni fine missione.
 */
export const AUGITE = [
  { mst_augite_id: 2483912298, mst_monument_type_id: 1 }, // 攻撃の輝石
  { mst_augite_id: 218378192, mst_monument_type_id: 2 }, // 防御の輝石
  { mst_augite_id: 2047024966, mst_monument_type_id: 3 }, // 体力の輝石
  { mst_augite_id: 3831991013, mst_monument_type_id: 4 }, // 武技Pの輝石
  { mst_augite_id: 2472589939, mst_monument_type_id: 5 }, // 自動の輝石
] as const;

type VoceAugite = { amount?: number | null; mst_augite_id?: number | null; mst_monument_type_id?: number | null };

/** 1-3 輝石 di un tipo a caso, sommati a quelli gia' posseduti (mai doppioni di tipo). */
export function daiAugite(monument: { augite?: VoceAugite[] } | undefined | null) {
  const tipo = AUGITE[Math.floor(Math.random() * AUGITE.length)]!;
  const premio = { amount: 1 + Math.floor(Math.random() * 3), ...tipo };
  if (!monument) return null;
  if (!Array.isArray(monument.augite)) monument.augite = [];
  const gia = monument.augite.find((a) => Number(a.mst_augite_id) === tipo.mst_augite_id);
  if (gia) gia.amount = Number(gia.amount ?? 0) + premio.amount;
  else monument.augite.push({ ...premio });
  return premio;
}

/*
 * SMISTAMENTO DELLE RICOMPENSE PER FAMIGLIA.
 *
 * mRewardItemList non dice di che tipo sia un premio: c'e' un campo
 * mRewardType, ma analizzando le 2635 quest si e' visto che NON serve a questo
 * (il tipo 1 contiene 13970 materiali e 13936 equipaggiamenti insieme).
 * L'unico criterio affidabile e' in quale tabella del gioco cade l'id, e le
 * tabelle sono disgiunte: zero id in comune, verificato.
 *
 * Le ricompense usano quattro famiglie, non una:
 *   materiale       -> box.materials      mst_material_id
 *   equipaggiamento -> box.equipments      mst_equipment_id   (506 quest!)
 *   crescita        -> box.growth_items    mst_growth_item_id (POTENTIAL_*)
 *   limitato        -> box.limiteds        mst_limited_id     (LIMITED*)
 *
 * Prima il codice trattava tutto come materiale e scartava il resto: per
 * questo le armi e le armature promesse da 506 quest non arrivavano mai.
 *
 * Un id che non sta nel catalogo va SEMPRE scartato. Non e' teoria: scriverne
 * uno in box mette nell'inventario un oggetto che il client non sa disegnare, e
 * da quel momento il login crasha a ogni tentativo perche' /api/box/get lo
 * rimanda ogni volta — e' successo con l'id 1277724242.
 */
type Famiglia = 'materiale' | 'equipaggiamento' | 'crescita' | 'limitato';

const CATALOGO = new Map<number, Famiglia>(
  (catalogoRicompense as ReadonlyArray<{ id: number; f: string }>)
    .filter((v) => v.f === 'materiale' || v.f === 'equipaggiamento' || v.f === 'crescita' || v.f === 'limitato')
    .map((v) => [v.id, v.f as Famiglia]),
);

// null ammesso oltre a undefined: e' cosi' che Mongoose tipizza i campi
// facoltativi dei sottodocumenti, e senza il null la compilazione fallisce.
interface VoceRicompensa {
  mItemHash?: string | null;
  mProbScale?: string | null;
}

/** La forma di un equipaggiamento che il client accetta: 16 campi esatti. */
function nuovoEquipaggiamento(idIstanza: string, mstId: number) {
  return {
    auto_potential_composite: 0,
    awaked: 0,
    created: Math.floor(Date.now() / 1000),
    elv: 1,
    endAwakeCount: 0,
    endAwakeRemain: 0,
    end_remain: 0,
    equipment_id: idIstanza,
    evolve_start_time: 0,
    favorite: 0,
    is_awake: 0,
    is_complete_auto_potential_composite: 0,
    mst_equipment_id: mstId,
    potential: 0,
    slv: 1,
    start_remain: 0,
  };
}

/**
 * Quanti Hunt Fest Flag P (vedi HUNT_FEST_POINT_ID in tradePointsService) paga
 * una missione sulle isole. Sono gli stessi che la schermata di fine caccia
 * mostra nel blocco `extend`: prima erano solo disegnati e non entravano mai in
 * box.points, quindi l'event shop non aveva nulla da spendere. Env:
 * QUEST_EVENT_FLAGS (0 disattiva l'accredito).
 */
const PUNTI_EVENTO_ISOLA = Number(process.env.QUEST_EVENT_FLAGS ?? 5) || 0;

/**
 * Pesca le ricompense UNA VOLTA SOLA e restituisce due cose: i quattro riquadri
 * per la risposta e la lista di cio' che e' stato pescato, da mettere in
 * inventario.
 *
 * Sono la stessa estrazione di proposito. Prima la funzione pescava solo per la
 * risposta e nessuno scriveva niente: il giocatore vedeva la ricompensa a fine
 * caccia e nell'inventario non arrivava. Pescare due volte, una per lo schermo e
 * una per l'inventario, sarebbe stato peggio: avrebbe mostrato un materiale e
 * consegnato un altro.
 */
function buildRewardSlots(lista?: readonly VoceRicompensa[] | null) {
  const voci = (lista ?? [])
    .filter((r) => r && r.mItemHash)
    .map((r) => ({ id: Number(r.mItemHash), peso: Math.max(1, Number(r.mProbScale) || 1) }))
    // Solo id presenti nel catalogo: qualunque altro numero verrebbe scritto in
    // inventario come oggetto inesistente e bloccherebbe il login.
    .filter((r) => Number.isFinite(r.id) && r.id > 0 && CATALOGO.has(r.id));

  const pescaUno = () => {
    if (!voci.length) return MATERIALE_DI_RIPIEGO;
    const totale = voci.reduce((t, v) => t + v.peso, 0);
    let n = Math.random() * totale;
    for (const v of voci) {
      n -= v.peso;
      if (n <= 0) return v.id;
    }
    return voci[voci.length - 1]!.id;
  };

  /*
   * Oltre ai premi della quest, ogni tanto esce un oggetto di crescita dei
   * partner (scheggia/sfera), cosi' si possono potenziare i partner giocando.
   * Probabilita' configurabile: QUEST_CRESCITA_CHANCE (0 disattiva).
   */
  const CHANCE_CRESCITA = Math.max(0, Math.min(1, Number(process.env.QUEST_CRESCITA_CHANCE ?? 0.35)));
  const pescaCrescita = () => CRESCITA_PARTNER[Math.floor(Math.random() * CRESCITA_PARTNER.length)]!.id;

  const vinti = new Map<number, { quanti: number; famiglia: Famiglia }>();

  /**
   * Una fila di quattro riquadri. `fila` distingue le casse fra loro: entra
   * nell'id istanza di un equipaggiamento, che deve restare unico anche fra
   * casse diverse della stessa caccia.
   */
  const costruisciFila = (fila: number, conPuntiEvento: boolean) => [1, 2, 3, 4].map((idx) => {
    // La fila principale puo' portare un oggetto di crescita dei partner al
    // posto del premio normale, cosi' si trovano giocando (vedi CHANCE_CRESCITA).
    const cresce = fila === 1 && Math.random() < CHANCE_CRESCITA;
    const id = cresce ? pescaCrescita() : pescaUno();
    const famiglia: Famiglia = cresce ? 'crescita' : (CATALOGO.get(id) ?? 'materiale');
    // Un'arma o un'armatura si vince a pezzo singolo, non a mucchietti: solo
    // materiali, oggetti di crescita e limitati hanno una quantita'.
    const quanti = famiglia === 'equipaggiamento' ? 1 : 1 + Math.floor(Math.random() * 3);

    const gia = vinti.get(id);
    vinti.set(id, { quanti: (gia?.quanti ?? 0) + quanti, famiglia });

    let itemList: Record<string, unknown>;
    switch (famiglia) {
      case 'equipaggiamento':
        // "equipments" al plurale: e' la chiave che il client si aspetta dentro
        // item_list, la stessa usata da questTraining e questForest. Al
        // singolare il client non trova la lista e si chiude alla schermata
        // delle ricompense, senza che il server registri nessun errore.
        // L'id istanza porta fila, riquadro e momento della vittoria: due pezzi
        // con lo stesso equipment_id sono il modo classico di rompere la box in
        // modo permanente.
        itemList = { equipments: [nuovoEquipaggiamento(`Q${id}_${fila}_${idx}_${Date.now()}`, id)] };
        break;
      case 'crescita':
        itemList = { growth_items: [{ amount: quanti, mst_growth_item_id: id }] };
        break;
      case 'limitato':
        itemList = { limiteds: [{ amount: quanti, mst_limited_id: id }] };
        break;
      default:
        itemList = { materials: [{ amount: quanti, mst_material_id: id }] };
    }

    const slot: Record<string, unknown> = {
      idx,
      is_katamari: 0,
      // Lo zenny si spalma qui sotto, quando si conosce il totale sorteggiato.
      zeny: 0,
      value: 1,
      item_list: itemList,
    };
    /*
     * Punti di scambio vinti: il primo riquadro della fila principale li porta
     * anche nell'item_list, cosi' quello che il giocatore vede a fine caccia e'
     * quello che il server accredita in box.points (vedi islandEnd).
     */
    if (fila === 1 && idx === 1 && PUNTI_PER_QUEST > 0) {
      (itemList as Record<string, unknown>).points = [
        { amount: PUNTI_PER_QUEST, mst_event_point_id: TRADE_POINT_ID },
      ];
    }
    /*
     * Punti evento (Hunt Fest Flag P): solo se l'evento li paga davvero. Con
     * QUEST_EVENT_FLAGS=0 il blocco va omesso del tutto, altrimenti il client
     * disegna comunque l'icona con "0" e mostra la schermata "hai ottenuto 0".
     */
    if (conPuntiEvento && idx === 1 && PUNTI_EVENTO_ISOLA > 0) {
      slot.extend = {
        item_list: { points: [{ amount: PUNTI_EVENTO_ISOLA, mst_event_point_id: HUNT_FEST_POINT_ID }] },
        zeny: 0,
      };
    }
    return slot;
  });

  /*
   * Tre file: quella principale piu' le due casse bonus (add_list.line2 e
   * line3). Anche quelle erano rimaste al materiale fisso 1714092880 e, come
   * la fila principale prima del fix, non venivano accreditate: si vedevano a
   * schermo e in inventario non arrivava niente. Pescando qui dentro finiscono
   * tutte e tre nella stessa mappa `vinti`, quindi cio' che il giocatore vede
   * e' esattamente cio' che riceve.
   */
  const slots = costruisciFila(1, true);
  const bonus2 = costruisciFila(2, false);
  const bonus3 = costruisciFila(3, false);
  /*
   * Zenny di fine quest: un importo casuale in un intervallo configurabile
   * (QUEST_ZENY, "min-max" o fisso). Il client somma lo `zeny` di ogni riquadro
   * e quello e' il totale che mostra; il server accredita lo stesso totale in
   * box.zeny (vedi islandEnd). L'importo si spalma sui dodici riquadri, cosi'
   * cio' che si vede e' cio' che si riceve.
   */
  const [zenyMin, zenyMax] = intervalloEnv('QUEST_ZENY', 5000, 100000);
  const zenny = interoCasuale(zenyMin, zenyMax);
  const riquadri = [...slots, ...bonus2, ...bonus3];
  let resto = zenny;
  riquadri.forEach((s, i) => {
    const quota = i === riquadri.length - 1 ? resto : Math.floor(zenny / riquadri.length);
    s.zeny = quota;
    resto -= quota;
  });
  return { slots, bonus2, bonus3, vinti, zenny, punti: PUNTI_PER_QUEST };
}

interface VoceQuantita {
  amount?: number | null;
}

interface BoxPremi {
  materials?: (VoceQuantita & { mst_material_id?: number | null })[];
  growth_items?: (VoceQuantita & { mst_growth_item_id?: number | null })[];
  limiteds?: (VoceQuantita & { mst_limited_id?: number | null })[];
  equipments?: { equipment_id?: string | null; mst_equipment_id?: number | null }[];
}

/**
 * Accredita i premi vinti, ognuno nell'array giusto della box.
 * Restituisce un riepilogo per il log.
 */
function accreditaPremi(box: BoxPremi, vinti: Map<number, { quanti: number; famiglia: Famiglia }>) {
  const conteggio = { materiale: 0, crescita: 0, limitato: 0, equipaggiamento: 0 };

  /** Somma una quantita' a un array "a mucchietto" (materiali/crescita/limitati). */
  const somma = <T extends VoceQuantita>(
    arr: T[], trovato: (v: T) => boolean, crea: () => T, quanti: number,
  ) => {
    const v = arr.find(trovato);
    if (v) v.amount = Number(v.amount ?? 0) + quanti;
    else arr.push(crea());
  };

  for (const [id, { quanti, famiglia }] of vinti) {
    switch (famiglia) {
      case 'materiale':
        if (!box.materials) box.materials = [];
        somma(box.materials, (m) => Number(m?.mst_material_id) === id,
          () => ({ mst_material_id: id, amount: quanti }), quanti);
        conteggio.materiale++;
        break;

      case 'crescita':
        if (!box.growth_items) box.growth_items = [];
        somma(box.growth_items, (m) => Number(m?.mst_growth_item_id) === id,
          () => ({ mst_growth_item_id: id, amount: quanti }), quanti);
        conteggio.crescita++;
        break;

      case 'limitato':
        if (!box.limiteds) box.limiteds = [];
        somma(box.limiteds, (m) => Number(m?.mst_limited_id) === id,
          () => ({ mst_limited_id: id, amount: quanti }), quanti);
        conteggio.limitato++;
        break;

      case 'equipaggiamento': {
        if (!box.equipments) box.equipments = [];
        /*
         * Un equipaggiamento e' un'istanza, non una quantita': due spade uguali
         * sono due righe con lo stesso mst_equipment_id ma equipment_id diversi
         * — se coincidessero il client le considererebbe lo stesso oggetto e ne
         * mostrerebbe una sola. Si cerca quindi un identificativo libero.
         */
        const usati = new Set(box.equipments.map((e) => String(e?.equipment_id)));
        for (let n = 0; n < quanti; n++) {
          let idIstanza = `Q${id}`;
          let contatore = 2;
          while (usati.has(idIstanza)) idIstanza = `Q${id}_${contatore++}`;
          usati.add(idIstanza);
          box.equipments.push(nuovoEquipaggiamento(idIstanza, id));
        }
        conteggio.equipaggiamento++;
        break;
      }
    }
  }
  return conteggio;
}

// Una casella di premio vuota: il client la accetta e non mostra niente.
const NESSUN_PREMIO = { item_list: {} };

/**
 * Il contenuto di un regalo a partire dai premi di una missione (stesse famiglie
 * della box, cosi' presentReceive li rimette negli array giusti).
 */
function contenutoPresente(vinti: Map<number, { quanti: number; famiglia: Famiglia }>): Record<string, unknown[]> {
  const content: Record<string, unknown[]> = {};
  for (const [id, { quanti, famiglia }] of vinti) {
    switch (famiglia) {
      case 'materiale': (content.materials ??= []).push({ mst_material_id: id, amount: quanti }); break;
      case 'crescita': (content.growth_items ??= []).push({ mst_growth_item_id: id, amount: quanti }); break;
      case 'limitato': (content.limiteds ??= []).push({ mst_limited_id: id, amount: quanti }); break;
      case 'equipaggiamento': (content.equipments ??= []).push(nuovoEquipaggiamento(`Q${id}`, id)); break;
    }
  }
  return content;
}

export const islandEnd = async (req: Request, res: Response) => {
  try {
    const { mst_quest_id, clear_time, session_id } = req.body as IslandEndInput;
    const cleared_quest = mst_quest_id;
    const clearTime = clear_time;
    // Solo le missioni che stanno su un'isola possono far incontrare un palico:
    // eventi/eternal passano da questa stessa rotta ma non hanno un part_id.
    const isolaDellaQuest = isolaDellaMissione(Number(cleared_quest));
    const filter = { current_session: session_id };
    const quest = await QuestSheet.findOne({ mQuestID: String(cleared_quest) });
    log.debug('Rewards: %o', quest?.mRewardItemList);
    const doc = await User.findOne(filter);
    if (!doc) {
      return encryptAndSend({}, res, req, ERROR_CODE.NOT_AUTHENTICATED); //Not authenticated
    }
    const cleared_quests = doc.cleared_quests;

    const questIndex = cleared_quests.findIndex((q) => q.mst_quest_id === cleared_quest);

    if (questIndex === -1) {
      log.debug('Inserted Quest as seen');
      cleared_quests.push({ mst_quest_id: cleared_quest, clear_time: clearTime });
    } else {
      // Keep the BEST time, not the last: overwrite only when this run is
      // faster. A clear with no time (0) never erases an existing record.
      const precedente = Number(cleared_quests[questIndex]!.clear_time ?? 0);
      const nuovo = Number(clearTime) || 0;
      if (nuovo > 0 && (precedente <= 0 || nuovo < precedente)) {
        log.debug('Updated clear_time...');
        cleared_quests[questIndex]!.clear_time = nuovo;
      }
    }

    /*
     * Le ricompense si pescano QUI, prima di scrivere, e vengono accreditate
     * nella stessa operazione che segna la quest come completata.
     *
     * Prima venivano costruite solo dentro la risposta, piu' in basso: il
     * client le mostrava a fine caccia e nell'inventario non arrivava niente.
     * Era il bug piu' visibile del server — si cacciava per nulla.
     */
    const premi = buildRewardSlots(quest?.mRewardItemList);

    const update: Record<string, unknown> = { cleared_quests: cleared_quests };
    // 狩玉 di fine missione.
    const gemmeMissione = KARIDAMA_A_MISSIONE;

    let augite: ReturnType<typeof daiAugite> = null;
    // Exp che i palico hanno preso in questa quest (otomo_result, in fondo).
    let otomoResult: ReturnType<typeof premiaOtomoFineQuest> = [];
    // Palico incontrato a fine missione (get_mst_otomo_id, in fondo).
    let nuovoOtomo: ReturnType<typeof creaOtomoIncontro> | null = null;
    let conteggioPremi = { materiale: 0, crescita: 0, limitato: 0, equipaggiamento: 0 };
    if (doc.box) {
      /*
       * Special Request (特別依頼): a fine caccia il gioco NON mette le ricompense
       * nella cassa, le spedisce al box dei regali ("依頼達成の報酬が送られて
       * きました"). Qui si crea il regalo e si salta l'accredito diretto,
       * altrimenti si riceverebbero due volte.
       */
      if (SPECIAL_REQUESTS.has(Number(cleared_quest)) && premi.vinti.size) {
        await Present.create({
          uu_id: doc.uu_id,
          content: contenutoPresente(premi.vinti),
          created: Date.now(),
          received: 0,
          valid: 1,
        });
        log.info('依頼 | %s: richiesta speciale %s, %d premi al regalo', doc.character_name ?? '?', String(cleared_quest), premi.vinti.size);
      } else {
        conteggioPremi = accreditaPremi(doc.box as unknown as BoxPremi, premi.vinti);
      }
      // Zenny: la stessa somma che i riquadri mostrano a fine caccia. Prima non
      // entrava mai in box.zeny, quindi il saldo restava quello iniziale
      // (100000) per sempre.
      const boxConZenny = doc.box as unknown as { zeny?: number | null };
      const zennyVinti = premi.zenny;
      if (zennyVinti > 0) {
        boxConZenny.zeny = Number(boxConZenny.zeny ?? 0) + zennyVinti;
      }
      // Per il "tutti i premi x5" pagato in 狩玉 (rewardFinal): si ricordano i premi
      // appena dati. Armi e armature no: sono pezzi unici, non si moltiplicano.
      update.ultimi_premi = {
        mst_quest_id: Number(cleared_quest),
        vinti: [...premi.vinti].filter(([, v]) => v.famiglia !== 'equipaggiamento').map(([id, v]) => [id, v.quanti, v.famiglia]),
      };
      // Quello che si e' raccolto nei punti di raccolta (services/raccoltaQuest.ts):
      // solo i punti dell'ultima quest avviata che il gioco dice di aver usato.
      const avviata = (doc as unknown as { raccolta_avviata?: { mst_quest_id?: number; punti?: PuntoAvviato[] } }).raccolta_avviata;
      if (avviata && Number(avviata.mst_quest_id) === Number(cleared_quest)) {
        const presi = raccoltoDaiBlocchi(avviata.punti, (req.body as { blocks?: unknown }).blocks);
        if (presi.size) {
          accreditaPremi(doc.box as unknown as BoxPremi, new Map([...presi].map(([id, quanti]) => [id, { quanti, famiglia: 'materiale' as Famiglia }])));
          log.info('raccolta | %s: %s', doc.character_name ?? '?', [...presi].map(([id, n]) => `${id} x${n}`).join(', '));
        }
      }
      update.raccolta_avviata = null;
      augite = daiAugite(doc.box.monument as { augite?: VoceAugite[] } | undefined);
      if (augite) log.info('輝石 | %s riceve %d x tipo %d', doc.character_name ?? '?', augite.amount, augite.mst_monument_type_id);
      // 狩玉 guadagnati giocando (niente microtransazioni): servono per il gacha dei gatti.
      aggiungiKaridama(doc.box as { payments?: { mst_payment_id?: number | null; amount?: number | null }[] }, gemmeMissione);
      log.info('狩玉 | %s riceve %d, saldo %d', doc.character_name ?? '?', gemmeMissione, saldoKaridama(doc.box.payments));
      // Palico: exp di fine quest per chi ha partecipato (services/otomoQuest.ts).
      const avviati = (doc as unknown as { otomo_avviati?: { mst_quest_id: number; otomo_ids: string[] } | null }).otomo_avviati;
      const otomoIds =
        avviati && Number(avviati.mst_quest_id) === Number(cleared_quest) && (avviati.otomo_ids?.length ?? 0) > 0
          ? avviati.otomo_ids
          : otomoIdsSquadraSelezionata((doc as unknown as { otomoteam?: Parameters<typeof otomoIdsSquadraSelezionata>[0] }).otomoteam);
      if (otomoIds.length) {
        otomoResult = premiaOtomoFineQuest(doc.box.otomos, otomoIds);
        if (otomoResult.length) {
          log.info('palico | %s: exp a %s', doc.character_name ?? '?', otomoResult.map((o) => `${o.otomo_id} +${o.get_exp}`).join(', '));
        }
      }
      /*
       * Incontro casuale con un palico nuovo, solo sulle missioni delle isole.
       * Il client lo scopre da `get_mst_otomo_id` (in fondo) e lo ritrova poi in
       * box.otomos: per questo va scritto QUI, nella stessa update dei premi.
       */
      if (isolaDellaQuest && Array.isArray(doc.box.otomos)) {
        const candidato = estraiOtomoIncontro(doc.box.otomos);
        if (candidato) {
          nuovoOtomo = creaOtomoIncontro(candidato);
          doc.box.otomos.push(nuovoOtomo);
          log.info('palico | %s incontra %s (%s, rarita %d)', doc.character_name ?? '?', candidato.name, nuovoOtomo.otomo_id, candidato.rarity);
        }
      }
      update.otomo_avviati = null;
      // Punti di scambio vinti con la quest: stessi numeri mostrati nei riquadri.
      if (premi.punti > 0) {
        const saldoPunti = aggiungiPunti(doc.box, premi.punti);
        log.info('punti di scambio | %s: +%d P per la quest %s (saldo %d)', doc.character_name ?? '?', premi.punti, String(cleared_quest), saldoPunti);
      }
      // Punti evento (Hunt Fest Flag P): gli stessi 5 mostrati a schermo. Prima
      // non venivano accreditati, quindi l'event shop restava a zero.
      if (PUNTI_EVENTO_ISOLA > 0) {
        const saldoEvento = aggiungiPunti(doc.box, PUNTI_EVENTO_ISOLA, HUNT_FEST_POINT_ID);
        log.info('punti evento | %s: +%d Hunt Fest Flag P per la quest %s (saldo %d)', doc.character_name ?? '?', PUNTI_EVENTO_ISOLA, String(cleared_quest), saldoEvento);
      }
      update.box = doc.box;
      log.info(
        'ricompense accreditate | quest=%s materiali=%d crescita=%d limitati=%d equipaggiamenti=%d zenny=%d (saldo %d)',
        String(cleared_quest), conteggioPremi.materiale, conteggioPremi.crescita, conteggioPremi.limitato, conteggioPremi.equipaggiamento,
        zennyVinti, Number(boxConZenny.zeny ?? 0),
      );
    }

    // Await the update so you know it completed
    await User.findOneAndUpdate(filter, update, { new: true });
    const data = {
    advance_bingo_mission_ids: [],
    campaign_info: [
      //{mst_campaign_type_id:0,value:0}
    ],
    clear_bingo_mission_ids: [],
    clear_subtarget_ids: [],
    // "Tutti i premi xN per M 狩玉": lo paga e lo applica rewardFinal (quest/reward/final).
    final_reward_info: {
      multiplier: PREMIO_FINALE.moltiplicatore,
      value: PREMIO_FINALE.prezzo,
    },
    get_accum_reward_ids: [],
    get_guild_accum_reward_ids: [],
    get_loop_random_reward_ids: [],
    get_loop_reward_ids: [],
    // 0 means "nothing new was acquired". These were hardcoded, so the server
    // claimed a Palico (2092467563) and a partner -- Ciel, 507850012, the
    // starting partner per src/json/user-defaults.json -- were gained after
    // EVERY quest, and Ciel re-ran her "mind if I train under you?" scene each
    // time. Nothing in a normal quest grants a partner. Now an island clear can
    // really leave a new Palico (services/otomoEncounter.ts), and only then is
    // this set: the box was written above in the same update.
    get_mst_otomo_id: nuovoOtomo?.mst_otomo_id ?? 0,
    get_mst_partner_id: 0,
    increase_value: 7,
    is_pop_not_enough_zeny: 0, // could not auto synth due to lack of zeny?
    katamari_content_list: [
      // {
      //   elv:0,
      //   end_remain:0,
      //   is_awake:0,
      //   mst_equipment_id:0,
      //   prob_type_id:0,
      //   slv:0,
      //   start_remain:0,
      // }
    ],
    max_potential_equipments: [
      //"stingval"
    ],
    mst_part_id: isolaDellaQuest ?? 3815380063, // isola della missione appena finita
    open_list: {
      open_ocean: [
        /*{"mst_ocean_id":0}*/
      ],
      open_node: [
        /*{"mst_node_id":0}*/
      ],
      open_part: [
        //{mst_part_id:2053326309}
      ],
    },
    // Exp dei palico che hanno partecipato (services/otomoQuest.ts). Prima era
    // sempre vuoto, quindi i palico non crescevano mai.
    otomo_result: otomoResult,
    partner_cap_list: [
      //unk
      // {
      //   level_cap_tier:0,
      //   mst_partner_id:0
      // }
    ],
    // Finestra dopo i premi. Prima mostrava 6 materiali finti mai accreditati;
    // ora i 輝石 davvero dati, nello stesso formato della storia (story.controller).
    pop_list: [{
      pop_id: 1,
      item_list: {
        ...(augite ? { monument: { augite: [augite], hr: 0, mlv: { atk: 0, def: 0, hp: 0, sp: 0 } } } : {}),
        payments: [{ mst_payment_id: KARIDAMA_PRINCIPALE, amount: gemmeMissione }],
      },
    }],
    ranking_num: 1, //unk
    rewards: {
      luck_value: 4,
      upper_luck_value: 10,
      /*
       * Le caselle "その他報酬" (bonus multi, raccolta, rottura parti, bingo, amici,
       * fortuna, soldi, drop speciali, raid). Prima erano tutte fisse a
       * Monster Body Fluid con numeri inventati, mostrate a ogni caccia e mai
       * accreditate. Nell'originale comparivano solo quando c'era il motivo:
       * finche' non si calcolano davvero restano vuote, cosi' non promettono niente.
       */
      multi_reward: NESSUN_PREMIO,
      pick_reward: NESSUN_PREMIO,
      break_reward: NESSUN_PREMIO,
      bingo_reward: NESSUN_PREMIO,
      friend_reward: NESSUN_PREMIO,
      lucky_reward: NESSUN_PREMIO,
      gold_reward: NESSUN_PREMIO,
      enemy_drop_reward: NESSUN_PREMIO,
      break_drop_reward: NESSUN_PREMIO,

      //DOUBLE CHECK BELOW START
      //This is the main reward screen
      normal_reward: {
        // Prima qui c'erano quattro voci fisse, tutte con lo stesso materiale
        // 1714092880: qualunque caccia dava sempre gli stessi premi. Ora si
        // pescano dalla lista della quest (mRewardItemList), con mProbScale
        // come peso, cosi' ogni battuta da' materiali diversi e coerenti con
        // la preda. Se la quest non ha premi si torna al vecchio valore fisso.
        // Gli stessi riquadri pescati sopra: cio' che si vede e' cio' che e'
        // stato messo in inventario, non una seconda estrazione.
        other_list_add: premi.slots,
        add_list: {
          /*
           * Le due casse bonus. Esistevano gia' nel client (con il loro
           * prezzo in diamanti) ma erano ferme al materiale fisso
           * 1714092880, e nessuno le accreditava: erano decorazione.
           * Ora pescano dalla stessa lista della quest e finiscono in
           * inventario insieme alla fila principale.
           *
           * is_open resta 1, cioe' gia' aperte: il client scala i diamanti
           * da solo e non esiste nessuna rotta con cui il server possa
           * verificare il pagamento (/quest/result/end risponde vuoto, come
           * nell'originale). Meglio regalarle che mostrarle a pagamento e
           * non riuscire a consegnarle: sarebbe di nuovo il bug di prima.
           */
          line2: {
            is_open: 1,
            other_list: premi.bonus2,
            price: 5,
          },
          line3: {
            is_open: 1,
            other_list: premi.bonus3,
            price: 5,
          },
        },
      },
      raid_reward: NESSUN_PREMIO,
      point_info: {
        armor_skill_value: 2,
        campaign_value: 2,
        get_point: 2,
        guild_bingo_bonus: 2,
        guild_total_point: 2,
        m16_get_point: 2,
        mst_event_info_id: 2,
        mst_event_point_id: 2,
        now_point: 2,
        total_point: 2,
      },

      score_enemy_list: [
        //unk
      ],
      // Lo stesso totale spalmato sui riquadri e accreditato in box.zeny: cosi'
      // la riga del saldo di fine missione combacia con quello che si riceve.
      zeny: premi.zenny,
    },

    view_collection_list: [], ////unk
    };
    encryptAndSend(data, res, req);
  } catch (error) {
    log.error('Error in islandEnd:', error);
    encryptAndSend({}, res, req, ERROR_CODE.GENERIC_ERROR, ERROR_CATEGORY.ERROR_DIALOG, 'Island end failed');
  }
};

/*
 * "全ての報酬5倍": a fine missione, aperti tutti i riquadri, il gioco offre di
 * moltiplicare x5 i premi pagando 2 狩玉 (final_reward_info). Quando si preme
 * chiama quest/reward/final (nessun campo nella richiesta; risposta
 * cAPIQuestRewardFinal::Response letta con Ghidra: payments = saldo aggiornato).
 * Qui: si scala il prezzo e si aggiungono gli altri (xN - 1) premi dell'ultima
 * missione finita, una volta sola. Senza premi da moltiplicare non si paga niente.
 */
export const PREMIO_FINALE = { moltiplicatore: 5, prezzo: 2 };

export const rewardFinal = async (req: Request, res: Response) => {
  try {
    const { session_id } = req.body as { session_id?: string };
    const doc = await User.findOne({ current_session: session_id });
    if (!doc) {
      return encryptAndSend({}, res, req, ERROR_CODE.NOT_AUTHENTICATED);
    }
    const box = doc.box as unknown as BoxPremi & {
      payments?: { mst_payment_id?: number | null; amount?: number | null }[];
      points?: { mst_event_point_id?: number | null; amount?: number | null }[];
    };
    const risposta = () => ({
      is_pop_not_enough_zeny: 0,
      point_info: {
        armor_skill_value: 0, campaign_value: 0, get_point: 0, guild_bingo_bonus: 0, guild_total_point: 0,
        m16_get_point: 0, mst_event_info_id: 2740334662, mst_event_point_id: 2992123464, now_point: 0, total_point: 0,
      },
      get_accum_reward_ids: [],
      get_guild_accum_reward_ids: [],
      get_loop_random_reward_ids: [],
      get_loop_reward_ids: [],
      max_potential_equipments: [],
      payments: (box?.payments ?? []).map((p) => ({ mst_payment_id: Number(p.mst_payment_id), amount: Number(p.amount ?? 0) })),
    });
    const ultimi = (doc as unknown as { ultimi_premi?: { mst_quest_id: number; vinti: [number, number, Famiglia][] } | null }).ultimi_premi;
    if (!box || !ultimi?.vinti?.length) {
      return encryptAndSend(risposta(), res, req);
    }
    if (!spendiKaridama(box, PREMIO_FINALE.prezzo)) {
      return encryptAndSend({}, res, req, ERROR_CODE.KARIDAMA_NOT_ENOUGH, ERROR_CATEGORY.ERROR_DIALOG,
        `狩玉が足りません (Not enough karidama: ${saldoKaridama(box.payments)}/${PREMIO_FINALE.prezzo})`);
    }
    accreditaPremi(box, new Map(ultimi.vinti.map(([id, quanti, famiglia]) => [id, { quanti: quanti * (PREMIO_FINALE.moltiplicatore - 1), famiglia }])));
    // I punti evento (Hunt Fest Flag P) non sono in `vinti` (non sono ne'
    // materiali ne' equipaggiamento), ma la schermata li moltiplica comunque
    // xN: qui si aggiungono gli (N-1) restanti, cosi' il totale accreditato e'
    // quello che il gioco mostra. La quota base l'ha gia' data islandEnd.
    if (PUNTI_EVENTO_ISOLA > 0) {
      const extraEvento = PUNTI_EVENTO_ISOLA * (PREMIO_FINALE.moltiplicatore - 1);
      const saldoEvento = aggiungiPunti(box, extraEvento, HUNT_FEST_POINT_ID);
      log.info('punti evento x%d | %s: +%d Hunt Fest Flag P (saldo %d)', PREMIO_FINALE.moltiplicatore, doc.character_name ?? '?', extraEvento, saldoEvento);
    }
    // Una volta sola: vale solo se i premi da moltiplicare sono ancora quelli letti.
    const r = await User.updateOne(
      { _id: doc._id, 'ultimi_premi.mst_quest_id': ultimi.mst_quest_id },
      { $set: { box: doc.box, ultimi_premi: null } },
    );
    if (r.modifiedCount !== 1) {
      return encryptAndSend(risposta(), res, req);
    }
    log.info('premi x%d | %s paga %d 狩玉, quest=%s, voci=%d, saldo %d', PREMIO_FINALE.moltiplicatore, doc.character_name ?? '?',
      PREMIO_FINALE.prezzo, String(ultimi.mst_quest_id), ultimi.vinti.length, saldoKaridama(box.payments));
    encryptAndSend(risposta(), res, req);
  } catch (error) {
    log.error('Error in rewardFinal:', error);
    encryptAndSend({}, res, req, ERROR_CODE.GENERIC_ERROR, ERROR_CATEGORY.ERROR_DIALOG, 'Reward final failed');
  }
};

export const islandMapAll = async (req: Request, res: Response) => {
  try {
    const { session_id } = req.body as IslandMapAllInput;
    const filter = { current_session: session_id };

    const doc = await User.findOne(filter);
    if (!doc) {
      return encryptAndSend({}, res, req, ERROR_CODE.NOT_AUTHENTICATED); //Not authenticated
    }

    const plainDoc = doc.toObject();
    const storieVisteDoc = new Set<number>((plainDoc as { storie_viste?: number[] }).storie_viste ?? []);
    // Isole la cui consegna e' gia' stata vista: per quelle la mappa rimanda
    // l'oggetto del paesaggio (vedi CONSEGNA_PER_ISOLA), altrimenti si perde.
    const isoleConsegna = new Set<number>();
    for (const [isola, scene] of CONSEGNA_PER_ISOLA) {
      if (scene.some((s) => storieVisteDoc.has(s))) isoleConsegna.add(isola);
    }
    // Tutorial finito: la mappa con la progressione vera (progressione_storia,
    // acceso per tutti), o la mappa completa per chi ha l'interruttore spento.
    const oceanPlain = plainDoc.tutorial_step == 0xffff
      ? (plainDoc.progressione_storia ? mappaProgressiva(full_island, missioniCompletate(plainDoc.cleared_quests), isoleConsegna) : full_island)
      : plainDoc.ocean_list;
    const clearedPlain = plainDoc.cleared_quests;

    const final_ocean = await enrichOceanData(oceanPlain, clearedPlain, (plainDoc as { storie_viste?: number[] }).storie_viste ?? []);
    log.debug('FINAL ocean data: %o', final_ocean);
    const data = {
      ocean_list: final_ocean,
    };

    encryptAndSend(data, res, req);
  } catch (error) {
    log.error('Error in islandMapAll:', error);
    encryptAndSend({}, res, req, ERROR_CODE.GENERIC_ERROR, ERROR_CATEGORY.ERROR_DIALOG, 'Island map all failed');
  }
};

/**
 * POST /quest/reward/exchange.
 *
 * Read out of the client (libMHS.so): the request carries only `idx`
 * (`cAPIQuestRewardExchange::Request::setup` reads "idx"), and the response is
 * `{ exchange_list: [{ amount, mst_exchange_id }] }`
 * (`cAPIQuestRewardExchange::Response::setup` reads "exchange_list" then
 * "amount" and "mst_exchange_id"; `sServer::createExchangeList` builds it from
 * generic item bases).
 *
 * What `idx` selects, and what the exchange master is, are NOT in the data we
 * have, so this is deliberately two things at once:
 *   - it always logs the request, so a live call reveals the real semantics;
 *   - it only pays Trade Points when QUEST_EXCHANGE_POINTS is set (> 0), and
 *     then only once per game day, so it can never be farmed in a loop.
 * With the default (0) it answers an empty, valid exchange_list -- safer than
 * the 404 the client used to get.
 */
export const rewardExchange = async (req: Request, res: Response) => {
  try {
    const { session_id, idx } = req.body as { session_id?: string; idx?: number };
    log.info('quest/reward/exchange | sessione=%s idx=%s body=%o', (session_id ?? '').slice(0, 8), String(idx), req.body);

    if (!session_id) {
      return encryptAndSend({ exchange_list: [] }, res, req);
    }
    const doc = await User.findOne({ current_session: session_id });
    if (!doc) {
      return encryptAndSend({}, res, req, ERROR_CODE.NOT_AUTHENTICATED);
    }

    const oggi = giornoGioco(new Date());
    const giaPagato = Number((doc as unknown as { punti_exchange_ultimo_giorno?: number }).punti_exchange_ultimo_giorno) === oggi;
    if (PUNTI_PER_RISCATTO <= 0 || giaPagato || !doc.box) {
      return encryptAndSend({ exchange_list: [] }, res, req);
    }

    const saldo = aggiungiPunti(doc.box, PUNTI_PER_RISCATTO);
    await User.updateOne(
      { _id: doc._id },
      {
        $set: {
          'box.points': (doc.box.points ?? []).map((p) => ({
            mst_event_point_id: Number(p.mst_event_point_id),
            amount: Number(p.amount ?? 0) || 0,
          })),
          punti_exchange_ultimo_giorno: oggi,
        },
      },
    );
    log.info('punti di scambio | %s riscatta la ricompensa %s: +%d P (saldo %d)', doc.character_name ?? '?', String(idx), PUNTI_PER_RISCATTO, saldo);
    encryptAndSend({ exchange_list: [{ amount: PUNTI_PER_RISCATTO, mst_exchange_id: TRADE_POINT_ID }] }, res, req);
  } catch (error) {
    log.error('Error in rewardExchange:', error);
    encryptAndSend({ exchange_list: [] }, res, req);
  }
};
