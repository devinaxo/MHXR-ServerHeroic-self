import event_nodes from '../../json/event_nodes.json' with { type: 'json' };
import { createLogger } from '../../middleware/logger.js';
import { tempoPerLista } from '../../services/questTime.js';
import type { QuestSubtarget } from '../../types/game.js';
const log = createLogger('eventUtils');
export const getDurationFromValue = (value: { getTime(): number } | null | undefined) => {
  if (!value) return null; // Handle cases where the date is not set
  const now = Date.now(); // Current timestamp in milliseconds
  return Math.max(0, Math.floor((value.getTime() - now) / 1000)); // Convert duration to seconds
};

interface EventEntry {
  mst_event_node_id?: number;
  mst_score_node_id?: number;
  quest_list?: Array<{
    clear_time: number;
    limited_amount: number;
    mst_limited_id: number;
    mst_quest_id: number;
    quest_subtargets: QuestSubtarget[];
    state: number;
  }>;
}

export function enrichEvent(
  eventList: EventEntry[],
  cleared?: ReadonlyArray<{ mst_quest_id: number; clear_time?: number | null }>,
): EventEntry[] {
  const tempo = new Map((cleared ?? []).map((q) => [q.mst_quest_id, Number(q.clear_time ?? 0) || 0]));
  return eventList.map((event) => {
    const nodeId = event.mst_event_node_id ?? event.mst_score_node_id;

    const node = event_nodes.find((node) => parseInt(node.mEventNodeHash, 10) === nodeId);

    if (!node) {
      log.warn(`No matching node found for event ID: ${event.mst_event_node_id}`);
      return event;
    }

    event.quest_list ??= [];

    for (const questId of node.mEventQuestList) {
      const id = parseInt(questId, 10);
      const ct = tempoPerLista(tempo.get(id));
      event.quest_list.push({
        clear_time: ct,
        limited_amount: 0,
        mst_limited_id: 0,
        mst_quest_id: id,
        quest_subtargets: [],
        state: ct > 0 ? 3 : 1,
      });
    }

    return event;
  });
}
