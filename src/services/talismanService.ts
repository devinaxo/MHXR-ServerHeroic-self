import User from '../model/user.js';
import omamoriData from '../json/omamori.json' with { type: 'json' };

/*
 * Charm / talisman (お守り) "enabled for this quest" flag.
 *
 * Every quest-start response carries `instance_data.enable_talisman` and
 * `enable_talisman_partner`. The server used to hardcode both to 0, which
 * disabled the equipped charm's skill and skill orbs for the whole hunt: the
 * weapon art required e.g. 6 fire orbs, the player had 4 from armour + 12 from
 * the charm, but only the armour's 4 counted, so the art stayed locked.
 *
 * The client computes this flag itself when it runs the offline server
 * (nServer::cQuestStartData::mTalismanEnable -> nResponse::Instance_data::
 * enable_talisman, via sServer::createQuestStartCommonParam). Online, the
 * server has to supply it.
 *
 * The equipped charm is the selected set's `talisman` slot. If that slot is
 * empty on the server (the client may have released and equipped a charm
 * locally without the equip-set save having round-tripped yet), we still enable
 * the feature when the player owns any *released* charm: the client only ever
 * applies the charm it actually has equipped, so this is safe and avoids the
 * "released but not counted" bug.
 */
const OMAMORI = omamoriData as unknown as { byMstId: Record<string, unknown> };

interface Pezzo {
  equipment_id?: string | null;
  mst_equipment_id?: number | null;
  is_awake?: number | null;
}
interface EquipSet {
  index?: number | null;
  talisman?: { equipment_id?: string | null } | null;
}
interface DocTalisman {
  equipset?: { selected_equip_set_index?: number | null; equip_sets?: EquipSet[] | null } | null;
  box?: { equipments?: Pezzo[] | null } | null;
}

/** 1 if the player can field a released charm for a quest, else 0. */
export function talismanAbilitato(doc: DocTalisman): number {
  const equipments = doc.box?.equipments ?? [];
  const set = doc.equipset?.equip_sets?.find(
    (s) => s.index === doc.equipset?.selected_equip_set_index,
  );
  const talismanId = set?.talisman?.equipment_id;
  const equipped = talismanId ? equipments.find((e) => e.equipment_id === talismanId) : undefined;
  if (equipped && Number(equipped.is_awake) === 1) return 1;

  const releasedCharm = equipments.some(
    (e) => OMAMORI.byMstId[String(e.mst_equipment_id)] !== undefined && Number(e.is_awake) === 1,
  );
  return releasedCharm ? 1 : 0;
}

/** Same as `talismanAbilitato`, looking the player up by session. */
export async function talismanAbilitatoDaSessione(sessionId: unknown): Promise<number> {
  if (typeof sessionId !== 'string' || !sessionId) return 0;
  try {
    const doc = await User.findOne({ current_session: sessionId });
    return doc ? talismanAbilitato(doc) : 0;
  } catch {
    // Never let a lookup failure block a quest start: worst case the charm is
    // treated as disabled (the old behaviour).
    return 0;
  }
}
