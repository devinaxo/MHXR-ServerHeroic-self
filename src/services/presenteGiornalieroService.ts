/*
 * Presente giornaliero: i Trade Points del giorno arrivano nella cassetta dei
 * regali (present box) invece di essere accreditati in silenzio sulla cassa.
 *
 * Perche'. Il bonus giornaliero veniva concesso mutando box.points al login, e
 * l'unica parte visibile era il popup "Day 1 Login Bonus" del client: un item
 * list che il gioco disegna senza l'immagine dell'oggetto (i punti non hanno un
 * ritratto come materiali e armi). Il regalo invece passa dal present box, che
 * ogni famiglia di oggetti la mostra con la sua icona. Quindi: niente piu'
 * accredito diretto ne' popup, si crea un Present al giorno.
 *
 * Una volta al giorno di gioco (rollover alle 05:00, vedi tradePointsService).
 * Il giorno si prenota con un update atomico su punti_ultimo_giorno, cosi' due
 * richieste in parallelo (login + apertura del negozio) non creano due regali.
 *
 * Il contenuto usa la stessa forma di presentReceive: points[] con
 * mst_event_point_id e amount, che il ricevitore fonde nelle righe esistenti.
 *
 * Kill switch: DAILY_PRESENT=0 torna a non creare nessun regalo.
 */
import User from '../model/user.js';
import Present from '../model/presents.js';
import { createLogger } from '../middleware/logger.js';
import { PUNTI_ID, PUNTI_GIORNALIERI, giornoGioco } from './tradePointsService.js';

const log = createLogger('presente');

export const PRESENTE_GIORNALIERO_ATTIVO = process.env.DAILY_PRESENT !== '0';

/** Messaggio mostrato nella cassetta. Sovrascrivibile per i test/localizzazioni. */
export const MESSAGGIO_PRESENTE_GIORNALIERO =
  process.env.DAILY_PRESENT_MESSAGE ?? 'Daily Trade Points';

type ConPuntiGiorno = {
  _id?: unknown;
  uu_id?: string | null;
  punti_ultimo_giorno?: number | null;
};

/** Le tre valute di scambio, una riga per ciascuna: il regalo le porta tutte. */
export function contenutoPuntiGiornalieri(): {
  points: { amount: number; mst_event_point_id: number }[];
} {
  return {
    points: [
      { amount: PUNTI_GIORNALIERI, mst_event_point_id: PUNTI_ID.base },
      { amount: PUNTI_GIORNALIERI, mst_event_point_id: PUNTI_ID.superiore },
      { amount: PUNTI_GIORNALIERI, mst_event_point_id: PUNTI_ID.speciale },
    ],
  };
}

/** Il documento Present del regalo del giorno. */
export function presentePuntiGiornalieri(uu_id: string) {
  return {
    uu_id,
    content: contenutoPuntiGiornalieri(),
    created: Date.now(),
    received: 0,
    valid: 1,
    message: MESSAGGIO_PRESENTE_GIORNALIERO,
  };
}

/**
 * Crea il regalo del giorno, al massimo una volta per giornata di gioco.
 *
 * Non lancia mai: il login la chiama fire-and-forget e non deve fallire per un
 * errore di scrittura (stessa regola di registraAccesso). Ritorna true solo
 * quando il regalo e' stato davvero creato.
 */
export async function consegnaPresenteGiornalieroAsync(doc: ConPuntiGiorno): Promise<boolean> {
  try {
    if (!PRESENTE_GIORNALIERO_ATTIVO) return false;
    const uu_id = doc.uu_id;
    if (!uu_id) return false;

    const oggi = giornoGioco(new Date());
    // Prenotazione atomica del giorno: se un'altra richiesta e' arrivata prima,
    // modifiedCount e' 0 e non si crea un secondo regalo.
    const presa = await User.updateOne(
      { _id: doc._id as never, punti_ultimo_giorno: { $ne: oggi } },
      { $set: { punti_ultimo_giorno: oggi } },
    );
    if (presa.modifiedCount !== 1) return false;

    await Present.create(presentePuntiGiornalieri(uu_id));
    log.info(
      'regalo giornaliero | %s: +%d P per ognuna delle 3 valute al box regali (giorno %d)',
      uu_id.slice(0, 8),
      PUNTI_GIORNALIERI,
      oggi,
    );
    return true;
  } catch (e: unknown) {
    log.warn('consegna del regalo giornaliero non riuscita:', e);
    return false;
  }
}
