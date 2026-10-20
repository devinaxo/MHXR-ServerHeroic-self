import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response } from 'express';

vi.mock('../../../services/crypto/encryptionHelpers');
vi.mock('../../../model/user');

import { encryptAndSend } from '../../../services/crypto/encryptionHelpers.js';
import User from '../../../model/user.js';
import materiali from '../../../json/materiali.json' with { type: 'json' };
import { infoGet, limitedskillGet, eventShopList, eventShopBuy } from './event.controller.js';
import { HUNT_FEST_POINT_ID, saldoPunti } from '../../../services/tradePointsService.js';
import { ERROR_CODE, ERROR_CATEGORY } from '../../../constants/error.codes.js';

function mockReqRes(body: Record<string, unknown> = {}) {
  const req = { body, ip: '127.0.0.1', get: vi.fn() } as unknown as Request;
  const res = {} as Response;
  return { req, res };
}

describe('event.controller', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('infoGet', () => {
    it('returns event info with beginner node and total event points', () => {
      const { req, res } = mockReqRes({});
      infoGet(req, res);

      expect(encryptAndSend).toHaveBeenCalledWith(
        expect.objectContaining({
          beginner_node_id: [1122664016],
          event_info: expect.arrayContaining([
            expect.objectContaining({
              mst_event_point_id: HUNT_FEST_POINT_ID,
              mst_event_shop_id: 1,
              name: 'Hunt Fest',
            }),
          ]),
          total_event_point_info: expect.arrayContaining([
            expect.objectContaining({
              amount: 20,
              mst_event_point_id: 898968147,
            }),
          ]),
        }),
        res,
        req,
      );
    });
  });

  describe('limitedskillGet', () => {
    it('returns empty limited skill lists', () => {
      const { req, res } = mockReqRes({});
      limitedskillGet(req, res);

      expect(encryptAndSend).toHaveBeenCalledWith(
        expect.objectContaining({
          limited_skill_excl_ev_infos: [],
          limited_skill_infos: [],
        }),
        res,
        req,
      );
    });
  });

  describe('Hunter Fest event shop', () => {
    const MATERIALI_REALI = new Set(materiali.map((m) => m.id));

    describe('eventShopList', () => {
      it('returns real material rows priced in Hunt Fest Flag P (no Japanese names)', async () => {
        vi.mocked(User.findOne).mockResolvedValue({
          character_name: 'H',
          box: { points: [{ mst_event_point_id: HUNT_FEST_POINT_ID, amount: 100 }] },
        } as never);
        const { req, res } = mockReqRes({ session_id: 's1', mst_event_info_id: 628862266 });

        await eventShopList(req, res);

        const [data] = vi.mocked(encryptAndSend).mock.calls[0]!;
        const righe = (data as { event_shop_items: { mst_shop_item_id: number; name: string; price: number; item_limit: number; shop_limit: number; item_contents: unknown }[] }).event_shop_items;
        expect(righe.length).toBeGreaterThan(0);
        for (const r of righe) {
          expect(MATERIALI_REALI.has(r.mst_shop_item_id)).toBe(true);
          expect(r.price).toBeGreaterThan(0);
          expect(r.item_limit).toBeGreaterThan(0);
          expect(r.shop_limit).toBeGreaterThan(0);
          expect(r.item_contents).toBeTruthy();
          expect(r.name).not.toMatch(/[\u3040-\u30ff\u4e00-\u9fff]/);
        }
      });

      it('returns NOT_AUTHENTICATED for an unknown session', async () => {
        vi.mocked(User.findOne).mockResolvedValue(null);
        const { req, res } = mockReqRes({ session_id: 'bad' });

        await eventShopList(req, res);

        expect(encryptAndSend).toHaveBeenCalledWith({}, res, req, ERROR_CODE.NOT_AUTHENTICATED);
      });
    });

    describe('eventShopBuy', () => {
      const PRIMO = 1921761827; // Enhancement Material, 5 flag

      it('debits Hunt Fest Flag P, credits the material and saves the box', async () => {
        const box = {
          points: [{ mst_event_point_id: HUNT_FEST_POINT_ID, amount: 15 }],
          materials: [] as { mst_material_id: number; amount: number }[],
        };
        const doc = { box, markModified: vi.fn(), save: vi.fn().mockResolvedValue(undefined) };
        vi.mocked(User.findOne).mockResolvedValue(doc as never);

        const { req, res } = mockReqRes({ session_id: 's1', amount: 2, mst_event_info_id: 628862266, mst_shop_item_id: PRIMO });
        await eventShopBuy(req, res);

        expect(saldoPunti(box as never, HUNT_FEST_POINT_ID)).toBe(5);
        expect(box.materials).toEqual([{ mst_material_id: PRIMO, amount: 2 }]);
        expect(doc.markModified).toHaveBeenCalledWith('box');
        expect(doc.save).toHaveBeenCalled();
        expect(encryptAndSend).toHaveBeenCalledWith(
          {
            item_contents: { materials: [{ amount: 2, mst_material_id: PRIMO }] },
            point: { amount: 5, mst_event_point_id: HUNT_FEST_POINT_ID },
          },
          res,
          req,
        );
      });

      it('refuses when the flags are short, without touching the box', async () => {
        const box = {
          points: [{ mst_event_point_id: HUNT_FEST_POINT_ID, amount: 1 }],
          materials: [] as { mst_material_id: number; amount: number }[],
        };
        const doc = { box, markModified: vi.fn(), save: vi.fn() };
        vi.mocked(User.findOne).mockResolvedValue(doc as never);

        const { req, res } = mockReqRes({ session_id: 's1', amount: 2, mst_shop_item_id: PRIMO });
        await eventShopBuy(req, res);

        expect(saldoPunti(box as never, HUNT_FEST_POINT_ID)).toBe(1);
        expect(box.materials).toEqual([]);
        expect(doc.save).not.toHaveBeenCalled();
        expect(encryptAndSend).toHaveBeenCalledWith(
          expect.objectContaining({ point: { amount: 1, mst_event_point_id: HUNT_FEST_POINT_ID } }),
          res, req, ERROR_CODE.ZENY_NOT_ENOUGH, ERROR_CATEGORY.ERROR_DIALOG, expect.any(String),
        );
      });

      it('refuses an id that is not on the shelf', async () => {
        const box = {
          points: [{ mst_event_point_id: HUNT_FEST_POINT_ID, amount: 100 }],
          materials: [] as { mst_material_id: number; amount: number }[],
        };
        const doc = { box, markModified: vi.fn(), save: vi.fn() };
        vi.mocked(User.findOne).mockResolvedValue(doc as never);

        const { req, res } = mockReqRes({ session_id: 's1', amount: 1, mst_shop_item_id: 999999999 });
        await eventShopBuy(req, res);

        expect(doc.save).not.toHaveBeenCalled();
        expect(encryptAndSend).toHaveBeenCalledWith({}, res, req, ERROR_CODE.GENERIC_ERROR, ERROR_CATEGORY.ERROR_DIALOG, expect.any(String));
      });
    });
  });
});
