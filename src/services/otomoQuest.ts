/*
 * Exp dei palico a fine quest.
 *
 * Il gioco manda l'exp ai palico che hanno partecipato dentro `otomo_result[]`
 * (`{ get_exp, mst_otomo_subskill_id, otomo_id }`) nella risposta di fine quest;
 * il client la applica e mostra il livello nuovo. Il server deve anche
 * PERSISTERE l'exp in `box.otomos[].exp`, altrimenti la prossima `box/otomo/get`
 * rimanda il valore vecchio.
 *
 * Quanti palico: quelli elencati nella richiesta di avvio quest (`otomo[]`),
 * ricordati in `doc.otomo_avviati` da questIsland/questEvent/... start.
 *
 * Quanta exp: OTOMO_QUEST_EXP, un importo casuale in un intervallo (formato
 * "min-max", oppure un valore fisso). La scala dei palico e' quella vera
 * (src/json/otomo-grow.json): un palico comune va da ~750 exp al 2 a ~4.7M per
 * il livello 80. Ogni quest sorteggia un valore nell'intervallo e lo da' a tutti
 * i palico che hanno partecipato. Alzare l'env per una crescita piu' rapida.
 *
 * Skill: agli sblocchi di livello 10 / 25 / 75 (vedi otomoGrow.slotSubSkillOtomo)
 * il palico impara una subskill, che finisce in `subskill[]` e viene annunciata
 * con `mst_otomo_subskill_id`. OTOMO_SKILL_ON_LEVELUP=0 spegne la cosa.
 */
import {
  applicaExpOtomo,
  skillDaImparareOtomo,
  subSkillValideOtomo,
  OTOMO_NO_SKILL,
} from './otomoGrow.js';
import { intervalloEnv, interoCasuale } from './intervalloEnv.js';

export interface OtomoBox {
  created?: number | null;
  exp?: number | null;
  mst_otomo_id?: number | null;
  otomo_id?: string | null;
  subskill?: number[] | null;
  level?: number | null;
}

export interface OtomoAvviati {
  mst_quest_id: number;
  otomo_ids: string[];
}

export interface PremioOtomo {
  get_exp: number;
  mst_otomo_subskill_id: number;
  otomo_id: string;
}

const OTOMO_QUEST_EXP_PREDEFINITO: [number, number] = [10000, 100000];

const SKILL_ON_LEVELUP = process.env.OTOMO_SKILL_ON_LEVELUP !== '0';

/** Gli `otomo_id` elencati in una richiesta di avvio quest (campo `otomo[]`). */
export function otomoIdsDaRichiesta(otomo: unknown): string[] {
  if (!Array.isArray(otomo)) return [];
  const ids: string[] = [];
  for (const o of otomo) {
    // Il client manda l'array così com'e': una lista di otomo_id (stringhe).
    // Gestiamo anche la forma a oggetto nel caso qualche rotta la usi.
    if (typeof o === 'string' && o) {
      ids.push(o);
      continue;
    }
    const id = (o as { otomo_id?: unknown } | null)?.otomo_id;
    if (typeof id === 'string' && id) ids.push(id);
  }
  return [...new Set(ids)];
}

/** Ricorda quali palico sono partiti con l'ultima quest avviata. */
export function registraOtomoAvviati(mstQuestId: number, otomo: unknown): OtomoAvviati {
  return { mst_quest_id: Number(mstQuestId) || 0, otomo_ids: otomoIdsDaRichiesta(otomo) };
}

/**
 * Rete di sicurezza: gli `otomo_id` della squadra selezionata in `user/otomoteam`.
 * Usata a fine quest quando l'avvio non ha registrato nulla (sessione vecchia,
 * payload inatteso), cosi' i palico prendono comunque l'exp.
 */
export function otomoIdsSquadraSelezionata(
  otomoteam: { selected_index?: number | null; otomo_team?: { index?: number | null; otomo_ids?: string[] }[] } | null | undefined,
): string[] {
  const squadre = otomoteam?.otomo_team;
  if (!Array.isArray(squadre)) return [];
  const scelta = squadre.find((s) => Number(s?.index) === Number(otomoteam?.selected_index)) ?? squadre[0];
  return (scelta?.otomo_ids ?? []).filter((s): s is string => typeof s === 'string' && !!s);
}

/**
 * Salva `otomo_avviati` sulla quest in corso. Stessa forma di salvaRaccolta:
 * prende l'updater del chiamante (User.updateOne) cosi' la rotta non importa il
 * modello per una sola scrittura.
 */
export async function salvaOtomoAvviati(
  aggiorna: (filtro: object, modifica: object) => Promise<unknown>,
  sessione: string,
  mstQuestId: unknown,
  otomo: unknown,
): Promise<void> {
  if (!sessione) return;
  await aggiorna(
    { current_session: sessione },
    { $set: { otomo_avviati: registraOtomoAvviati(Number(mstQuestId), otomo) } },
  );
}

/**
 * A fine quest: dai l'exp ai palico indicati, insegna le subskill dovute e
 * restituisci le righe `otomo_result`. Modifica `otomos` in place.
 */
export function premiaOtomoFineQuest(
  otomos: OtomoBox[] | null | undefined,
  otomoIds: ReadonlyArray<string>,
): PremioOtomo[] {
  if (!Array.isArray(otomos) || otomoIds.length === 0) return [];
  // Un solo sorteggio per quest: tutti i palico che hanno partecipato prendono
  // la stessa exp, come se la caccia ne valesse una sola.
  const [expMin, expMax] = intervalloEnv('OTOMO_QUEST_EXP', ...OTOMO_QUEST_EXP_PREDEFINITO);
  const expQuest = interoCasuale(expMin, expMax);
  const premi: PremioOtomo[] = [];
  for (const id of new Set(otomoIds)) {
    const otomo = otomos.find((o) => String(o?.otomo_id) === String(id));
    if (!otomo) continue;

    const esito = applicaExpOtomo(otomo, expQuest);
    otomo.exp = esito.exp;
    // Il client ricava il livello da exp; teniamo anche il campo allineato.
    otomo.level = esito.level;

    let skill: number | null = null;
    if (SKILL_ON_LEVELUP) {
      skill = skillDaImparareOtomo(otomo.mst_otomo_id, esito.level, subSkillValideOtomo(otomo.subskill));
      if (skill) {
        otomo.subskill = [...subSkillValideOtomo(otomo.subskill), skill];
      }
    }

    premi.push({
      get_exp: expQuest,
      mst_otomo_subskill_id: skill ?? 0,
      otomo_id: String(otomo.otomo_id),
    });
  }
  return premi;
}

/** Rimuove una subskill da un palico (box/otomo/skill/remove). */
export function dimenticaSubSkillOtomo(otomo: OtomoBox, mstSkillId: number): boolean {
  const prima = otomo.subskill ?? [];
  const dopo = prima.filter((s) => Number(s) !== Number(mstSkillId) && s !== OTOMO_NO_SKILL);
  if (dopo.length === prima.filter((s) => s !== OTOMO_NO_SKILL).length) return false;
  otomo.subskill = dopo;
  return true;
}

export { OTOMO_NO_SKILL };
