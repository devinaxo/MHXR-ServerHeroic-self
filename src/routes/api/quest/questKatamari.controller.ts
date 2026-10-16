import { Request, Response } from 'express';
import { encryptAndSend } from '../../../services/crypto/encryptionHelpers.js';
import { ERROR_CODE, ERROR_CATEGORY } from '../../../constants/error.codes.js';
import { createLogger } from '../../../middleware/logger.js';
import QuestSheet from '../../../model/questSheet.js';
import equipaggiamenti from '../../../json/equipaggiamenti.json' with { type: 'json' };
import catalogoRicompense from '../../../json/catalogo-ricompense.json' with { type: 'json' };

const log = createLogger('katamari');

/*
 * I KATAMARI: i fagotti/equipaggiamento ottenibili da una quest.
 *
 * Il client chiede il contenuto con /quest/katamari/content/get, indicando
 * QUEST, NODO EVENTO e PARTE:
 *
 *   req  { session_id, mst_quest_id, mst_event_node_id, mst_part_id }
 *   resp { katamari_content_list: [{ elv, end_remain, is_awake,
 *                                    mst_equipment_id, prob_type_id, slv,
 *                                    start_remain }] }
 *
 * (Da cAPIQuestKatamariContentGet::Request::to_json / ::Response::setup.)
 * E' il riquadro "ottenibili" della schermata di dettaglio di una quest.
 *
 * COSA FACEVA: ignorava quest e parte e pescava 6 equipaggiamenti A CASO
 * (Math.random): il riquadro cambiava ad ogni apertura e non c'entrava con la
 * missione.
 *
 * COSA FA ORA: usa la tabella delle ricompense VERA della quest
 * (mRewardItemList), tenendo solo la famiglia "equipaggiamento" del catalogo
 * (il campo mRewardType non e' affidabile, vedi questIsland.controller.ts), e
 * li ordina per rarita' decrescente (il pezzo pregiato prima). NIENTE tetto:
 * si mandano TUTTI i pezzi in tabella.
 *
 * Se la quest NON elenca equipaggiamento (quasi tutte le missioni della storia:
 * le loro ricompense sono materiali; l'equipaggiamento arriva dai katamari in
 * caccia, e quella tabella parte->katamari->pezzo sta in rKatamariInfo.ktmi
 * dentro rsdnt_property.arc, non ancora estratta) si risponde con la lista
 * VUOTA: il client mostra "Equipment Crystals cannot be obtained in this quest"
 * invece di inventare equipaggiamento.
 */

interface VoceEquip {
  i: number; // id
  r: number; // rarita'
  c: string; // categoria
}

// rarita' per id, dal catalogo ({ i, r, c }).
const RARITA = new Map<number, number>(
  (equipaggiamenti as ReadonlyArray<VoceEquip>).map((e) => [e.i, e.r]),
);

/** id -> famiglia ('equipaggiamento', 'materiale', ...). */
const FAMIGLIA = new Map<number, string>(
  (catalogoRicompense as ReadonlyArray<{ id: number; f: string }>).map((v) => [v.id, v.f]),
);

export const contentGet = async (req: Request, res: Response) => {
  try {
    const corpo = (req.body ?? {}) as Record<string, unknown>;
    const questId = String(corpo.mst_quest_id ?? '');
    const partId = String(corpo.mst_part_id ?? '');
    const nodeId = String(corpo.mst_event_node_id ?? '');

    // Equipaggiamento VERO elencato dalla quest, dal piu' raro al piu' comune.
    let ids: number[] = [];
    let fonte = 'nessuna';
    if (questId && questId !== '0') {
      const quest = await QuestSheet.findOne({ mQuestID: questId });
      ids = [
        ...new Set(
          (quest?.mRewardItemList ?? [])
            .map((r) => Number(r?.mItemHash))
            .filter((id) => Number.isFinite(id) && id > 0 && FAMIGLIA.get(id) === 'equipaggiamento'),
        ),
      ];
      ids.sort((a, b) => (RARITA.get(b) ?? 0) - (RARITA.get(a) ?? 0));
      if (ids.length) fonte = 'ricompense-quest';
    }

    log.info(
      'katamari | quest=%s parte=%s nodo=%s fonte=%s pezzi=%d',
      questId || '-', partId || '-', nodeId || '-', fonte, ids.length,
    );

    const data = {
      katamari_content_list: ids.map((id, i) => ({
        elv: 0,
        end_remain: 0,
        is_awake: 0,
        mst_equipment_id: id,
        prob_type_id: i === 0 ? 1 : 0,
        slv: 0,
        start_remain: 0,
      })),
    };
    encryptAndSend(data, res, req);
  } catch (error) {
    log.error('Errore in katamari contentGet:', error);
    encryptAndSend({}, res, req, ERROR_CODE.GENERIC_ERROR, ERROR_CATEGORY.ERROR_DIALOG, 'Katamari content failed');
  }
};
