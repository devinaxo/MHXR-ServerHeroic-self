import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../model/user');
vi.mock('../model/presents');
vi.mock('../middleware/logger', () => ({
  createLogger: () => ({ info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() }),
}));

import User from '../model/user.js';
import Present from '../model/presents.js';
import { PUNTI_ID, PUNTI_GIORNALIERI, giornoGioco } from './tradePointsService.js';
import {
  contenutoPuntiGiornalieri,
  consegnaPresenteGiornalieroAsync,
  presentePuntiGiornalieri,
} from './presenteGiornalieroService.js';

describe('presenteGiornalieroService', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('the gift carries the three Trade Point currencies at the daily amount', () => {
    expect(contenutoPuntiGiornalieri()).toEqual({
      points: [
        { amount: PUNTI_GIORNALIERI, mst_event_point_id: PUNTI_ID.base },
        { amount: PUNTI_GIORNALIERI, mst_event_point_id: PUNTI_ID.superiore },
        { amount: PUNTI_GIORNALIERI, mst_event_point_id: PUNTI_ID.speciale },
      ],
    });
  });

  it('shapes the present so presentReceive can put it back in the box', () => {
    const p = presentePuntiGiornalieri('uu-1');
    expect(p).toEqual(expect.objectContaining({ uu_id: 'uu-1', received: 0, valid: 1 }));
    expect(p.content.points).toHaveLength(3);
  });

  it('claims the day atomically, then creates the present', async () => {
    vi.mocked(User.updateOne).mockResolvedValue({ modifiedCount: 1 } as never);
    vi.mocked(Present.create).mockResolvedValue({} as never);

    const creato = await consegnaPresenteGiornalieroAsync({ _id: 'id1', uu_id: 'uu-1' });

    expect(creato).toBe(true);
    const oggi = giornoGioco(new Date());
    expect(User.updateOne).toHaveBeenCalledWith(
      { _id: 'id1', punti_ultimo_giorno: { $ne: oggi } },
      { $set: { punti_ultimo_giorno: oggi } },
    );
    expect(Present.create).toHaveBeenCalledWith(expect.objectContaining({ uu_id: 'uu-1' }));
  });

  it('does not create a second present when the day was already claimed', async () => {
    vi.mocked(User.updateOne).mockResolvedValue({ modifiedCount: 0 } as never);
    expect(await consegnaPresenteGiornalieroAsync({ _id: 'id1', uu_id: 'uu-1' })).toBe(false);
    expect(Present.create).not.toHaveBeenCalled();
  });

  it('does nothing without a uu_id', async () => {
    expect(await consegnaPresenteGiornalieroAsync({ _id: 'id1' })).toBe(false);
    expect(User.updateOne).not.toHaveBeenCalled();
    expect(Present.create).not.toHaveBeenCalled();
  });

  it('never throws when the database fails, so login is not blocked', async () => {
    vi.mocked(User.updateOne).mockRejectedValue(new Error('DB giu'));
    await expect(consegnaPresenteGiornalieroAsync({ _id: 'id1', uu_id: 'uu-1' })).resolves.toBe(
      false,
    );
  });
});
