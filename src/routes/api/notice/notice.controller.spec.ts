import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response } from 'express';

vi.mock('../../../model/user');
vi.mock('../../../model/presents');
vi.mock('../../../services/crypto/encryptionHelpers');
vi.mock('../../../middleware/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
  }),
}));

import User from '../../../model/user.js';
import Present from '../../../model/presents.js';
import { encryptAndSend } from '../../../services/crypto/encryptionHelpers.js';
import { ERROR_CODE } from '../../../constants/error.codes.js';
import { get } from './notice.controller.js';

function mockReqRes(body: Record<string, unknown> = {}) {
  const req = { body, ip: '127.0.0.1', get: vi.fn() } as unknown as Request;
  const res = {} as Response;
  return { req, res };
}

describe('notice.controller', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('get', () => {
    it('returns NOT_AUTHENTICATED when user not found', async () => {
      vi.mocked(User.findOne).mockResolvedValue(null);
      const { req, res } = mockReqRes({ session_id: 'bad' });
      await get(req, res);
      expect(encryptAndSend).toHaveBeenCalledWith({}, res, req, ERROR_CODE.NOT_AUTHENTICATED);
    });

    it('returns notice data with present count', async () => {
      vi.mocked(User.findOne).mockResolvedValue({ uu_id: 'uid1' } as never);
      vi.mocked(Present.countDocuments).mockResolvedValue(3);

      const { req, res } = mockReqRes({ session_id: 'sess-1' });
      await get(req, res);

      expect(encryptAndSend).toHaveBeenCalledWith(
        expect.objectContaining({
          new_present: 3,
          banner_list: expect.objectContaining({
            outer_banner_list: expect.any(Array),
            resident_banner_list: expect.any(Array),
          }),
          campaign_list: expect.objectContaining({
            event_campaign_list: expect.any(Array),
            island_campaign_list: expect.any(Array),
          }),
          navigationNum: expect.objectContaining({
            notClearNum: 0,
          }),
          stretch_effect_info: expect.objectContaining({
            mst_event_info_id: 3454260853,
          }),
        }),
        res,
        req,
      );
    });

    /*
     * The Extra Treasure Bun (マシマシ宝まん) is offered by the pre-quest PowerUp
     * menu only when a free use is left. The client copies the notice's
     * `increase_info` into cGameUserInfo and checks max_num - now_num >= 1; with
     * the old all-zero payload the option was greyed out on every quest.
     */
    it('advertises a free Extra Treasure Bun via increase_info', async () => {
      vi.mocked(User.findOne).mockResolvedValue({ uu_id: 'uid1' } as never);
      vi.mocked(Present.countDocuments).mockResolvedValue(0);

      const { req, res } = mockReqRes({ session_id: 'sess-1' });
      await get(req, res);

      const data = vi.mocked(encryptAndSend).mock.calls[0]![0] as {
        increase_info: { max_num: number; now_num: number; remain_time: number };
      };
      expect(data.increase_info.max_num - data.increase_info.now_num).toBeGreaterThanOrEqual(1);
      expect(data.increase_info.remain_time).toBeGreaterThan(0);
    });

    /*
     * Campaign banners are drawn from `message` verbatim, so the debug stubs the
     * route used to carry ("Notice/Get island_campaign", "test", ...) were
     * visible in the game as a banner over the island map that followed the
     * player onto every quest. Nothing may be put back until there is a real
     * campaign behind it.
     */
    it('sends no campaign banners, so no debug text reaches the client', async () => {
      vi.mocked(User.findOne).mockResolvedValue({ uu_id: 'uid1' } as never);
      vi.mocked(Present.countDocuments).mockResolvedValue(0);

      const { req, res } = mockReqRes({ session_id: 'sess-1' });
      await get(req, res);

      const corpo = vi.mocked(encryptAndSend).mock.calls[0]![0] as {
        campaign_list: Record<string, unknown[]>;
      };
      for (const [nome, lista] of Object.entries(corpo.campaign_list)) {
        expect(lista, `${nome} should be empty`).toEqual([]);
      }
      // Belt and braces: no debug string anywhere in the payload.
      expect(JSON.stringify(corpo)).not.toMatch(/Notice\/Get|\btest\b/);
    });

    it('returns new_present=0 when no unreceived presents', async () => {
      vi.mocked(User.findOne).mockResolvedValue({ uu_id: 'uid1' } as never);
      vi.mocked(Present.countDocuments).mockResolvedValue(0);

      const { req, res } = mockReqRes({ session_id: 'sess-1' });
      await get(req, res);

      const data = vi.mocked(encryptAndSend).mock.calls[0]![0] as { new_present: number };
      expect(data.new_present).toBe(0);
    });
  });
});
