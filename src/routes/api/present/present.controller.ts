import { Request, Response } from 'express';
import { encryptAndSend } from '../../../services/crypto/encryptionHelpers.js';
import { ERROR_CODE, ERROR_CATEGORY } from '../../../constants/error.codes.js';
import { createLogger } from '../../../middleware/logger.js';
import User from '../../../model/user.js';
import Present from '../../../model/presents.js';
import { addItem } from '../../../services/boxService.js';
import type { SessionOnlyInput, PresentReceiveInput } from './present.schema.js';
const log = createLogger('present');

/**
 * Fonde un item di saldo (`amount` + `mst_*_id`) nella riga con lo stesso id,
 * creandola se manca. Vedi il commento in presentReceive sul perche'.
 */
function unisciRiga(righe: unknown[], chiaveId: string, item: unknown): void {
  const voce = item as Record<string, unknown>;
  const id = Number(voce[chiaveId]);
  const quantita = Number(voce.amount ?? 0) || 0;
  const riga = righe.find((r) => Number((r as Record<string, unknown>)[chiaveId]) === id) as
    | { amount?: unknown }
    | undefined;
  if (riga) riga.amount = (Number(riga.amount ?? 0) || 0) + quantita;
  else righe.push({ [chiaveId]: id, amount: quantita });
}

export const presentSync = async (req: Request, res: Response) => {
  try {
    const { session_id } = req.body as SessionOnlyInput;
    const userDoc = await User.findOne({ current_session: session_id });
    if (!userDoc) {
      return encryptAndSend({}, res, req, ERROR_CODE.NOT_AUTHENTICATED); // Not authenticated
    }

    encryptAndSend(
      {
        presentDetail: await Present.find({ uu_id: userDoc.uu_id }),
      },
      res,
      req,
    );
  } catch (error) {
    log.error('Error in presentSync:', error);
    encryptAndSend({}, res, req, ERROR_CODE.GENERIC_ERROR, ERROR_CATEGORY.ERROR_DIALOG, 'Present sync failed');
  }
};

export const presentReceive = async (req: Request, res: Response) => {
  try {
    const { _ids: requestedIdsToBePutInBox, session_id } = req.body as PresentReceiveInput;
    const userDoc = await User.findOne({ current_session: session_id });
    if (!userDoc) {
      return encryptAndSend({}, res, req, ERROR_CODE.NOT_AUTHENTICATED); // Not authenticated
    }

    const presents = await Present.find({
      _id: { $in: requestedIdsToBePutInBox },
      // Scope to the caller and skip what was already claimed: without this a
      // re-sent id would credit the same items twice (and any id could be
      // claimed by any player).
      uu_id: userDoc.uu_id,
      received: { $ne: 1 },
    });

    type BoxKey = keyof import('../../../types/game.js').Box;
    await Promise.all(
      presents.map(async (present) => {
        for (const [key, value] of Object.entries(present.toObject().content)) {
          log.debug('CONTENT KEY', key);
          if (!Array.isArray(value)) continue;
          for (const item of value) {
            log.debug('ADDED ITEM TO BOX', key, item);
            /*
             * Points and payments are BALANCES keyed by their mst_ id, not
             * one-off items: two rows with the same id would both be kept, and
             * the box reads only the first, so the second gift would vanish.
             * Merge into the existing row (or start one) instead of pushing.
             */
            if (key === 'points') {
              unisciRiga(userDoc.box!.points ??= [], 'mst_event_point_id', item);
            } else if (key === 'payments') {
              unisciRiga(userDoc.box!.payments ??= [], 'mst_payment_id', item);
            } else {
              addItem(userDoc.box!, key as BoxKey, item);
            }
          }
        }
        await Present.updateOne({ _id: present._id }, { received: 1 });
      }),
    );
    await User.updateOne({ uu_id: userDoc.uu_id }, { box: userDoc.box });

    const data = {
      presentDetail: await Present.find({ uu_id: userDoc.uu_id }), //this should only be
      receive_num: presents.length,
    };
    encryptAndSend(data, res, req);
  } catch (error) {
    log.error('Error in presentReceive:', error);
    encryptAndSend({}, res, req, ERROR_CODE.GENERIC_ERROR, ERROR_CATEGORY.ERROR_DIALOG, 'Present receive failed');
  }
};
