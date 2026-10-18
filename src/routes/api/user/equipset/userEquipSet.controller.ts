import { Request, Response } from 'express';
import { encryptAndSend } from '../../../../services/crypto/encryptionHelpers.js';
import { ERROR_CODE, ERROR_CATEGORY } from '../../../../constants/error.codes.js';
import User from '../../../../model/user.js';
import { createLogger } from '../../../../middleware/logger.js';
import { completaSetMercenari, sistemaMercenari } from '../../../../services/setMercenari.js';
import type { SessionOnlyInput, EquipSetSetInput, EquipSetSocialSetInput } from './userEquipSet.schema.js';
const log = createLogger('equipSet');

/*
 * Pezzi di un set di equipaggiamento + helper per un set vuoto. Serve perche' il
 * gioco mostra un numero di set pari a `capacity_eqp_set` (5 di default) e si
 * aspetta un elemento `equip_sets` per ognuno: con un solo set salvato il menu
 * ne mostrava UNO solo. Si completano gli indici mancanti fino alla capacita'
 * (le armature restano "NO_EQUIP", i mercenari li riempie sistemaMercenari).
 *
 * ATTENZIONE: questi set completati servono SOLO alla risposta di `get`. NON
 * vanno mai riscritti sul database: sono copie di comodo e riscriverle
 * cancellava i set veri del giocatore (e i mercenari tornavano all'arma
 * predefinita). Il salvataggio avviene solo in `set`.
 */
const PEZZI_SET = ['arm', 'body', 'leg', 'head', 'secret_weapon', 'talisman', 'waist', 'weapon'] as const;
/**
 * Un set vuoto NON va bene: `sPlayerWorkspace::getEquipWeapon(set)` cerca l'arma
 * del set nel box e la dereferenzia senza controllare, quindi un set con
 * "NO_EQUIP" fa crashare il gioco appena ci si passa sopra (tombstone:
 * getEquipWeapon <- getEquipSet <- setupMyHunterDetail <- setSelectMySetId).
 * Gli indici mancanti si riempiono quindi COPIANDO i pezzi del set selezionato
 * (pezzi reali, presenti nel box), che il giocatore poi cambia a piacere. Si
 * copiano anche i mercenari: cosi' un set clonato nasce con i compagni
 * equipaggiati invece che vuoti (che farebbe crashare il cambio set).
 */
function copiaPartner(modello: Record<string, unknown> | undefined) {
  const ps = (modello?.partner_equip_sets as Record<string, unknown>[] | undefined) ?? [];
  return ps.map((p) => {
    const c: Record<string, unknown> = { mst_partner_id: p.mst_partner_id ?? 0 };
    for (const k of PEZZI_SET) {
      const pezzo = p[k] as { equipment_id?: string } | undefined;
      c[k] = pezzo?.equipment_id ? { ...pezzo } : { equipment_id: 'NO_EQUIP' };
    }
    return c;
  });
}

function cloneDa(index: number, modello: Record<string, unknown> | undefined) {
  const out: Record<string, unknown> = { index, partner_equip_sets: copiaPartner(modello) };
  for (const k of PEZZI_SET) {
    const p = modello?.[k] as { equipment_id?: string } | undefined;
    out[k] = p?.equipment_id ? { ...(p as object) } : { equipment_id: 'NO_EQUIP' };
  }
  return out;
}
/**
 * Restituisce `capacita` set. Un set si tiene solo se la sua arma e' davvero nel
 * box; altrimenti (indice mancante, oppure arma "NO_EQUIP"/venduta) si ricopia
 * dal set selezionato. Serve perche' `sPlayerWorkspace::getEquipWeapon(set)`
 * dereferenzia senza controllare la ricerca dell'arma nel box: un set senza arma
 * valida fa crashare il gioco appena ci si passa sopra.
 */
function setsCompleti(
  esistenti: { index?: number | null; weapon?: { equipment_id?: string | null } | null }[] | undefined,
  capacita: number,
  selezionato: number,
  nelBox: (id: string | null | undefined) => boolean,
) {
  const sets = [...(esistenti ?? [])];
  const armaValida = (s: (typeof sets)[number] | undefined) =>
    !!s && !!s.weapon?.equipment_id && s.weapon.equipment_id !== 'NO_EQUIP' && nelBox(s.weapon.equipment_id);
  const modello = (sets.find((s) => Number(s.index) === selezionato && armaValida(s)) ?? sets.find(armaValida)) as
    | unknown as Record<string, unknown> | undefined;
  const out: { index?: number | null }[] = [];
  for (let i = 1; i <= capacita; i++) {
    const s = sets.find((x) => Number(x.index) === i);
    if (armaValida(s)) {
      (s as { index?: number | null }).index = i;
      out.push(s as { index?: number | null });
    } else {
      out.push(cloneDa(i, modello) as unknown as { index?: number | null });
    }
  }
  return out;
}

type SetLoose = { index?: number | null; partner_equip_sets?: { mst_partner_id?: number | null }[] | null; [k: string]: unknown };

/**
 * Unisce i set ricevuti dal gioco a quelli gia' salvati, per `index`. Il gioco
 * manda i set che ha in memoria (di solito tutti), ma un salvataggio parziale
 * (un solo set, come per otomoteam/set) non deve cancellare gli altri. Dentro
 * ogni set i mercenari si uniscono per `mst_partner_id`, cosi' una lista
 * parziale di mercenari non cancella gli altri.
 */
function unisciSets(salvati: SetLoose[] | undefined, ricevuti: SetLoose[] | undefined): SetLoose[] {
  const out = [...(salvati ?? [])];
  for (const inc of ricevuti ?? []) {
    const idx = Number(inc?.index);
    if (!Number.isFinite(idx)) continue;
    const pos = out.findIndex((s) => Number(s?.index) === idx);
    if (pos === -1) out.push(inc);
    else out[pos] = unisciPartner(out[pos]!, inc);
  }
  return out.sort((a, b) => Number(a.index) - Number(b.index));
}

function unisciPartner(salvato: SetLoose, nuovo: SetLoose): SetLoose {
  const esistenti = Array.isArray(salvato.partner_equip_sets) ? [...salvato.partner_equip_sets] : [];
  const inc = Array.isArray(nuovo.partner_equip_sets) ? nuovo.partner_equip_sets : [];
  if (inc.length === 0) return { ...salvato, ...nuovo, partner_equip_sets: esistenti };
  const out = [...esistenti];
  for (const p of inc) {
    const id = Number(p?.mst_partner_id);
    if (!Number.isFinite(id)) continue;
    const pos = out.findIndex((x) => Number(x?.mst_partner_id) === id);
    if (pos === -1) out.push(p);
    else out[pos] = { ...out[pos], ...p };
  }
  return { ...salvato, ...nuovo, partner_equip_sets: out };
}

export const equipSetGet = async (req: Request, res: Response) => {
  try {
    const { session_id } = req.body as SessionOnlyInput;
    const filter = { current_session: session_id };

    const doc = await User.findOne(filter);
    if (!doc) {
      return encryptAndSend({}, res, req, ERROR_CODE.NOT_AUTHENTICATED);
    }
    const utente = doc.toObject();
    const capacita = Math.max(1, Number(doc.equipset?.capacity_eqp_set ?? 1) || 1);
    const selezionato = Number(doc.equipset?.selected_equip_set_index ?? 1) || 1;
    // Prima si completano i mercenari sui set SALVATI (nessun setDaSalvare): si
    // scrive sul database solo se serve davvero (un compagno senza set valido, o
    // l'arma predefinita che manca nel box). Non si tocca l'equipaggiamento vero.
    const m = await sistemaMercenari(utente, (f, u) => User.updateOne(f, u));
    const ids = new Set((utente.box?.equipments ?? []).map((e) => String(e.equipment_id)));
    const sets = setsCompleti(
      m.sets as { index?: number | null; weapon?: { equipment_id?: string | null } | null }[] | undefined,
      capacita,
      selezionato,
      (id) => !!id && ids.has(String(id)),
    );
    // Rete di sicurezza per la risposta: se anche il set modello non aveva
    // mercenari, i set mostrati li riempiono qui (solo in memoria). L'eventuale
    // arma predefinita che manca nel box si aggiunge per davvero.
    const box = (utente.box ?? { equipments: [], partners: [] }) as Parameters<typeof completaSetMercenari>[0];
    const { aggiunti } = completaSetMercenari(box, sets);
    if (aggiunti.length) {
      await User.updateOne({ _id: utente._id }, { $push: { 'box.equipments': { $each: aggiunti } } });
    }
    const data = { ...utente.equipset, equip_sets: sets } as object;
    encryptAndSend(data, res, req);
  } catch (error) {
    log.error('Error in equipSetGet:', error);
    encryptAndSend({}, res, req, ERROR_CODE.GENERIC_ERROR, ERROR_CATEGORY.ERROR_DIALOG, 'Get equip set failed');
  }
};

export const equipSetSet = async (req: Request, res: Response) => {
  try {
    const { session_id, equip_sets, selected_equip_set_index, capacity_eqp_set } = req.body as EquipSetSetInput;
    const filter = { current_session: session_id };
    const doc = await User.findOne(filter);
    if (!doc?.equipset) {
      return encryptAndSend({}, res, req, ERROR_CODE.NOT_AUTHENTICATED);
    }
    // I set salvati si uniscono a quelli ricevuti, non si sostituiscono: un invio
    // parziale non cancella i set che il gioco non ha mandato.
    const salvati = (doc.toObject().equipset?.equip_sets ?? []) as SetLoose[];
    const sets = equip_sets.length > 0 ? unisciSets(salvati, equip_sets as SetLoose[]) : salvati;

    // Indice selezionato e capacita' si salvano SEMPRE, anche se non arrivano set:
    // cambiare solo il set attivo e' comunque una modifica da ricordare.
    doc.equipset.selected_equip_set_index = selected_equip_set_index;
    doc.equipset.capacity_eqp_set = capacity_eqp_set;
    await User.findByIdAndUpdate(doc.id, { 'equipset.selected_equip_set_index': selected_equip_set_index, 'equipset.capacity_eqp_set': capacity_eqp_set });

    // I set arrivano dal gioco: prima di salvarli si completano i mercenari (arma e set validi).
    const m =
      equip_sets.length > 0
        ? await sistemaMercenari(doc.toObject(), (f, u) => User.updateOne(f, u), sets)
        : await sistemaMercenari(doc.toObject(), (f, u) => User.updateOne(f, u));
    const data = { ...doc.toObject().equipset, equip_sets: m.sets } as object;
    encryptAndSend(data, res, req);
  } catch (error) {
    log.error('Error in equipSetSet:', error);
    encryptAndSend({}, res, req, ERROR_CODE.GENERIC_ERROR, ERROR_CATEGORY.ERROR_DIALOG, 'Set equip set failed');
  }
};

export const equipSetSocialGet = async (req: Request, res: Response) => {
  try {
    const { session_id } = req.body as SessionOnlyInput;
    const filter = { current_session: session_id };
    const doc = await User.findOne(filter);
    if (!doc) {
      return encryptAndSend({}, res, req, ERROR_CODE.NOT_AUTHENTICATED);
    }
    const data = {
      social_equip_sets: doc.social_equip_sets,
    };
    encryptAndSend(data, res, req);
  } catch (error) {
    log.error('Error in equipSetSocialGet:', error);
    encryptAndSend({}, res, req, ERROR_CODE.GENERIC_ERROR, ERROR_CATEGORY.ERROR_DIALOG, 'Get social equip set failed');
  }
};
export const equipSetSocialSet = async (req: Request, res: Response) => {
  try {
    const { session_id, social_equip_sets } = req.body as EquipSetSocialSetInput;
    const filter = { current_session: session_id };
    const doc = await User.findOne(filter);
    if (!doc) {
      return encryptAndSend({}, res, req, ERROR_CODE.NOT_AUTHENTICATED);
    }
    if (social_equip_sets.length > 0) {
      doc.social_equip_sets = social_equip_sets as typeof doc.social_equip_sets;

      const update = { social_equip_sets: doc.social_equip_sets };

      await User.findByIdAndUpdate(doc.id, update);
    }
    const data = doc.social_equip_sets ?? [];
    encryptAndSend(data, res, req);
  } catch (error) {
    log.error('Error in equipSetSocialSet:', error);
    encryptAndSend({}, res, req, ERROR_CODE.GENERIC_ERROR, ERROR_CATEGORY.ERROR_DIALOG, 'Set social equip set failed');
  }
};
