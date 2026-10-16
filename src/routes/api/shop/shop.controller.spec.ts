import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response } from 'express';

vi.mock('../../../services/crypto/encryptionHelpers');
vi.mock('../../../model/user');
vi.mock('../../../model/presents');

import { encryptAndSend } from '../../../services/crypto/encryptionHelpers.js';
import User from '../../../model/user.js';
import Present from '../../../model/presents.js';
import materiali from '../../../json/materiali.json' with { type: 'json' };
import {
  karidamaInfo,
  karidamaList,
  karidamaBuy,
  info,
  list,
  buy,
} from './shop.controller.js';
import { PUNTI_ID, TRADE_POINT_ID, giornoGioco, prezzoPerRarita, saldoPunti, PER_GIOCOATORE } from '../../../services/tradePointsService.js';
import { ERROR_CODE, ERROR_CATEGORY } from '../../../constants/error.codes.js';

function mockReqRes(body: Record<string, unknown> = {}) {
  const req = { body, ip: '127.0.0.1', get: vi.fn() } as unknown as Request;
  const res = {} as Response;
  return { req, res };
}

// Un materiale vero preso dal catalogo (src/json/materiali.json), non
// inventato: lo stesso file da cui shop.controller.ts costruisce PER_ID, cosi'
// il test resta valido qualunque sia il campione mostrato in vetrina.
const MATERIALE_REALE = materiali[0]!;

describe('shop.controller', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('karidamaInfo', () => {
    it('returns karidama shop info list', () => {
      const { req, res } = mockReqRes();
      karidamaInfo(req, res);

      expect(encryptAndSend).toHaveBeenCalledWith(
        expect.objectContaining({
          karidama_shop_infos: expect.arrayContaining([
            expect.objectContaining({
              mst_karidama_shop_id: 1,
              name: 'Hunter Coin Exchange',
            }),
          ]),
        }),
        res,
        req,
      );
    });
  });

  describe('karidamaList', () => {
    it('returns real, buyable materials priced in Hunter Coins', () => {
      const { req, res } = mockReqRes();
      karidamaList(req, res);

      const [data] = vi.mocked(encryptAndSend).mock.calls[0]!;
      const righe = (data as {
        karidama_shop_items: { mst_shop_item_id: number; name: string; price: number; item_limit: number }[];
        type_list: { name: string; type: number }[];
      }).karidama_shop_items;

      expect(righe.length).toBeGreaterThan(0);
      const idsReali = new Set(materiali.map((m) => m.id));
      for (const r of righe) {
        // Real material ids, priced above 0 (the old stub was free and unclickable).
        expect(idsReali.has(r.mst_shop_item_id)).toBe(true);
        expect(r.price).toBeGreaterThan(0);
        expect(r.item_limit).toBeGreaterThan(0);
        expect(r.name).not.toBe('name');
      }
      expect(encryptAndSend).toHaveBeenCalledWith(
        expect.objectContaining({
          type_list: [{ name: 'Exchange', type: 0 }],
          mst_karidama_shop_id: 1,
        }),
        res,
        req,
      );
    });
  });

  describe('karidamaBuy', () => {
    it('spends Hunter Coins, adds the material and returns {item_contents, payments}', async () => {
      const box = {
        payments: [{ mst_payment_id: 3301823224, amount: 100 }],
        materials: [] as { mst_material_id: number; amount: number }[],
      };
      vi.mocked(User.findOne).mockResolvedValue({ _id: 'id', character_name: 'H', box } as never);
      vi.mocked(User.updateOne).mockResolvedValue({} as never);

      const { req, res } = mockReqRes({
        session_id: 's1',
        mst_karidama_shop_id: 1,
        mst_shop_item_id: 1183126671,
        amount: 2,
      });
      await karidamaBuy(req, res);

      // 100 - 2 * 10
      expect(box.payments[0]!.amount).toBe(80);
      expect(box.materials).toEqual([{ mst_material_id: 1183126671, amount: 2 }]);
      expect(User.updateOne).toHaveBeenCalled();
      const [data] = vi.mocked(encryptAndSend).mock.calls[0]!;
      const risposta = data as { item_contents: { materials: unknown[] }; payments: { mst_payment_id: number }[] };
      expect(risposta.item_contents.materials).toEqual([{ amount: 2, mst_material_id: 1183126671 }]);
      expect(risposta.payments.find((p) => p.mst_payment_id === 3301823224)).toBeTruthy();
    });

    it('refuses when Hunter Coins are short, without touching the box', async () => {
      const box = { payments: [{ mst_payment_id: 3301823224, amount: 5 }], materials: [] };
      vi.mocked(User.findOne).mockResolvedValue({ _id: 'id', box } as never);
      const { req, res } = mockReqRes({
        session_id: 's1',
        mst_karidama_shop_id: 1,
        mst_shop_item_id: 1183126671,
        amount: 1,
      });
      await karidamaBuy(req, res);
      expect(User.updateOne).not.toHaveBeenCalled();
      expect(box.payments[0]!.amount).toBe(5);
      expect(encryptAndSend).toHaveBeenCalledWith(
        expect.objectContaining({ payments: expect.any(Array) }),
        res, req, ERROR_CODE.ZENY_NOT_ENOUGH, ERROR_CATEGORY.ERROR_DIALOG, expect.any(String),
      );
    });
  });

  describe('info', () => {
    it('returns shop infos with high/low upper shops', () => {
      const { req, res } = mockReqRes();
      info(req, res);

      expect(encryptAndSend).toHaveBeenCalledWith(
        expect.objectContaining({
          high_upper_shop_info: expect.objectContaining({
            mst_shop_id: 1,
            name: 'shop',
          }),
          low_upper_shop_info: expect.objectContaining({
            mst_shop_id: 2,
            name: 'shop',
          }),
          shop_infos: expect.arrayContaining([
            expect.objectContaining({ mst_shop_id: 3, name: 'shop' }),
          ]),
        }),
        res,
        req,
      );
    });
  });

  describe('list', () => {
    it('splits the three shelves by rarity and adds the partner growth items to the rarest', async () => {
      vi.mocked(User.findOne).mockResolvedValue({
        punti_ultimo_giorno: giornoGioco(new Date()),
        box: {
          points: [
            { mst_event_point_id: PUNTI_ID.base, amount: 500 },
            { mst_event_point_id: PUNTI_ID.superiore, amount: 700 },
            { mst_event_point_id: PUNTI_ID.speciale, amount: 900 },
          ],
        },
        save: vi.fn().mockResolvedValue(undefined),
      } as never);
      const { req, res } = mockReqRes({ session_id: 'sess-1' });
      await list(req, res);

      const raritaPerId = new Map(materiali.map((m) => [m.id, m.rarita]));
      const [data] = vi.mocked(encryptAndSend).mock.calls[0]!;
      const d = data as {
        high_upper_shop_items: { mst_shop_item_id: number; price: number; shop_limit: number; shop_limit_max: number; item_limit: number; item_limit_max: number; name: string }[];
        low_upper_shop_items: typeof d.high_upper_shop_items;
        shop_items: typeof d.high_upper_shop_items;
      };

      const raritaDi = (list: typeof d.shop_items) =>
        list.filter((i) => raritaPerId.has(i.mst_shop_item_id)).map((i) => raritaPerId.get(i.mst_shop_item_id)!);

      // The client's tabs are crossed relative to the response keys: the normal
      // Trade Points tab reads `shop_items` and the Special Deal tab reads
      // `high_upper_shop_items`. So common goes on `shop_items`, rare (with the
      // growth items) on `high_upper_shop_items`.
      expect(d.high_upper_shop_items.length).toBeGreaterThan(0);
      expect(d.low_upper_shop_items.length).toBeGreaterThan(0);
      expect(d.shop_items.length).toBeGreaterThan(0);
      expect(raritaDi(d.shop_items).every((r) => r <= 3)).toBe(true);
      expect(raritaDi(d.low_upper_shop_items).every((r) => r >= 4 && r <= 6)).toBe(true);

      // The rare tab groups the rare materials (★7-8) with the partner growth
      // items and the enhancement materials (both extra ids on the same shelf).
      const idsRari = new Set(d.high_upper_shop_items.map((i) => i.mst_shop_item_id));
      const rareRar = new Set(raritaDi(d.high_upper_shop_items));
      expect(rareRar.has(7) && rareRar.has(8)).toBe(true);
      expect(idsRari.has(1921761827)).toBe(true); // Enhancement Material
      expect(idsRari.has(3170475390)).toBe(true); // Ciel Growth Orb

      // Growth orbs cost 50 and stock 99; the common/mid shelves have no extras.
      const orb = d.high_upper_shop_items.find((i) => i.mst_shop_item_id === 3170475390);
      expect(orb?.price).toBe(50);
      expect(orb?.shop_limit_max).toBe(99);
      expect(d.shop_items.some((i) => !raritaPerId.has(i.mst_shop_item_id))).toBe(false);
      expect(d.low_upper_shop_items.some((i) => !raritaPerId.has(i.mst_shop_item_id))).toBe(false);

      for (const item of d.high_upper_shop_items) {
        expect(item.price).toBeGreaterThan(0);
        expect(item.shop_limit).toBeGreaterThan(0);
        expect(item.item_limit).toBeGreaterThanOrEqual(0);
        expect(item.item_limit).toBeLessThanOrEqual(item.item_limit_max);
        expect(item.name).not.toMatch(/[\u3040-\u30ff\u4e00-\u9fff]/);
      }

      expect(encryptAndSend).toHaveBeenCalledWith(
        expect.objectContaining({
          points: [
            { mst_event_point_id: PUNTI_ID.base, amount: 500 },
            { mst_event_point_id: PUNTI_ID.superiore, amount: 700 },
            { mst_event_point_id: PUNTI_ID.speciale, amount: 900 },
          ],
        }),
        res,
        req,
      );
    });

    it('sends the daily gift to the present box when the post is opened', async () => {
      const doc = {
        _id: 'id1',
        uu_id: 'uu1',
        punti_ultimo_giorno: undefined,
        box: { points: [] as { mst_event_point_id: number; amount: number }[] },
      };
      vi.mocked(User.findOne).mockResolvedValue(doc as never);
      vi.mocked(User.updateOne).mockResolvedValue({ modifiedCount: 1 } as never);
      vi.mocked(Present.create).mockResolvedValue({} as never);

      const { req, res } = mockReqRes({ session_id: 'sess-1' });
      await list(req, res);

      expect(Present.create).toHaveBeenCalledWith(
        expect.objectContaining({ uu_id: 'uu1', content: expect.objectContaining({ points: expect.any(Array) }) }),
      );
    });
  });

  describe('buy', () => {
    it('debits the tier-3 currency, credits the material and saves the box', async () => {
      const costo = prezzoPerRarita(MATERIALE_REALE.rarita) * 3;
      const box = {
        zeny: 10,
        points: [{ mst_event_point_id: PUNTI_ID.speciale, amount: costo + 5 }],
        materials: [] as { mst_material_id: number; amount: number }[],
      };
      const doc = { box, markModified: vi.fn(), save: vi.fn().mockResolvedValue(undefined) };
      vi.mocked(User.findOne).mockResolvedValue(doc as never);

      const { req, res } = mockReqRes({
        session_id: 'sess-1',
        amount: 3,
        mst_shop_id: 3,
        mst_shop_item_id: MATERIALE_REALE.id,
      });
      await buy(req, res);

      // Trade Points, not zeny: the zeny is left alone.
      // Spent from the tier-3 currency, because the request said mst_shop_id 3.
      expect(saldoPunti(box as never, PUNTI_ID.speciale)).toBe(5);
      expect(box.zeny).toBe(10);
      expect(box.materials).toEqual([{ mst_material_id: MATERIALE_REALE.id, amount: 3 }]);
      expect(doc.markModified).toHaveBeenCalledWith('box');
      expect(doc.save).toHaveBeenCalled();
      expect(encryptAndSend).toHaveBeenCalledWith(
        {
          item_contents: { materials: [{ amount: 3, mst_material_id: MATERIALE_REALE.id }] },
          // A single `point` object, not a top-level `points` array: that is
          // what cAPIShopBuy::Response::setup parses, and what makes the client
          // refresh its cached balance.
          point: { amount: 5, mst_event_point_id: PUNTI_ID.speciale },
        },
        res,
        req,
      );
    });

    it('refuses when there are not enough Trade Points, without touching the box', async () => {
      const box = {
        points: [{ mst_event_point_id: PUNTI_ID.speciale, amount: 1 }],
        materials: [] as { mst_material_id: number; amount: number }[],
      };
      const doc = { box, markModified: vi.fn(), save: vi.fn() };
      vi.mocked(User.findOne).mockResolvedValue(doc as never);

      const { req, res } = mockReqRes({
        session_id: 'sess-1',
        amount: 3,
        mst_shop_id: 3,
        mst_shop_item_id: MATERIALE_REALE.id,
      });
      await buy(req, res);

      expect(doc.save).not.toHaveBeenCalled();
      expect(box.materials).toEqual([]);
      expect(saldoPunti(box as never, PUNTI_ID.speciale)).toBe(1);
      expect(encryptAndSend).toHaveBeenCalledWith(
        { point: { amount: 1, mst_event_point_id: PUNTI_ID.speciale } },
        res, req, ERROR_CODE.ZENY_NOT_ENOUGH, ERROR_CATEGORY.ERROR_DIALOG, expect.any(String),
      );
    });

    it('rejects an id that is not a real material, without touching the box', async () => {
      const box = { zeny: 10, materials: [] };
      const doc = { box, markModified: vi.fn(), save: vi.fn() };
      vi.mocked(User.findOne).mockResolvedValue(doc as never);

      const { req, res } = mockReqRes({
        session_id: 'sess-1',
        amount: 1,
        mst_shop_id: 3,
        mst_shop_item_id: 999999999,
      });
      await buy(req, res);

      expect(doc.save).not.toHaveBeenCalled();
      expect(box.zeny).toBe(10);
      expect(encryptAndSend).toHaveBeenCalledWith(
        {},
        res,
        req,
        expect.any(Number),
        expect.anything(),
        'Oggetto non disponibile',
      );
    });

    it('rejects when the player has no Trade Points at all', async () => {
      const box = { points: [], materials: [] };
      const doc = { box, markModified: vi.fn(), save: vi.fn() };
      vi.mocked(User.findOne).mockResolvedValue(doc as never);

      const { req, res } = mockReqRes({
        session_id: 'sess-1',
        amount: 1,
        mst_shop_id: 3,
        mst_shop_item_id: MATERIALE_REALE.id,
      });
      await buy(req, res);

      expect(doc.save).not.toHaveBeenCalled();
      // 80 = "not enough", the same code the zenny path used.
      expect(encryptAndSend).toHaveBeenCalledWith(
        { point: { amount: 0, mst_event_point_id: PUNTI_ID.speciale } },
        res,
        req,
        ERROR_CODE.ZENY_NOT_ENOUGH,
        ERROR_CATEGORY.ERROR_DIALOG,
        expect.stringContaining('Trade Points'),
      );
    });

    it('buys a partner growth item into box.growth_items, priced in Special Deal P', async () => {
      // Ciel Growth Orb (500 exp) costs 50 Special Deal Points.
      const box = {
        points: [{ mst_event_point_id: PUNTI_ID.speciale, amount: 500 }],
        materials: [] as unknown[],
        growth_items: [] as { mst_growth_item_id: number; amount: number }[],
      };
      const doc = { box, markModified: vi.fn(), save: vi.fn().mockResolvedValue(undefined) };
      vi.mocked(User.findOne).mockResolvedValue(doc as never);

      const { req, res } = mockReqRes({ session_id: 's1', amount: 1, mst_shop_id: 3, mst_shop_item_id: 3170475390 });
      await buy(req, res);

      expect(box.growth_items).toEqual([{ mst_growth_item_id: 3170475390, amount: 1 }]);
      expect(saldoPunti(box as never, PUNTI_ID.speciale)).toBe(450);
      const [data] = vi.mocked(encryptAndSend).mock.calls[0]!;
      expect((data as { item_contents: unknown }).item_contents).toEqual({
        growth_items: [{ amount: 1, mst_growth_item_id: 3170475390 }],
      });
    });

    it("uses the item's own daily limit (growth items allow 99, not the global limit)", async () => {
      // 12 already taken today: under the growth items' own limit (99). This is
      // the case that wrongly answered ITEMS_NOT_ENOUGH (55) even with points to
      // spare.
      const oggi = giornoGioco(new Date());
      const box = {
        points: [{ mst_event_point_id: PUNTI_ID.speciale, amount: 500 }],
        materials: [] as unknown[],
        growth_items: [] as { mst_growth_item_id: number; amount: number }[],
      };
      const doc = {
        box,
        negozi_acquistati: { [oggi]: { '3170475390': 12 } },
        markModified: vi.fn(),
        save: vi.fn().mockResolvedValue(undefined),
      };
      vi.mocked(User.findOne).mockResolvedValue(doc as never);

      const { req, res } = mockReqRes({ session_id: 's1', amount: 1, mst_shop_id: 3, mst_shop_item_id: 3170475390 });
      await buy(req, res);

      expect(box.growth_items).toEqual([{ mst_growth_item_id: 3170475390, amount: 1 }]);
      expect(encryptAndSend).toHaveBeenCalledWith(
        expect.objectContaining({ item_contents: expect.any(Object), point: expect.any(Object) }),
        res, req,
      );
    });

    it('still refuses a material past the material daily limit', async () => {
      const oggi = giornoGioco(new Date());
      const box = {
        points: [{ mst_event_point_id: TRADE_POINT_ID, amount: 9999 }],
        materials: [] as unknown[],
        growth_items: [] as unknown[],
      };
      const doc = {
        box,
        negozi_acquistati: { [oggi]: { [String(MATERIALE_REALE.id)]: PER_GIOCOATORE } },
        markModified: vi.fn(),
        save: vi.fn().mockResolvedValue(undefined),
      };
      vi.mocked(User.findOne).mockResolvedValue(doc as never);

      const { req, res } = mockReqRes({ session_id: 's1', amount: 1, mst_shop_id: 1, mst_shop_item_id: MATERIALE_REALE.id });
      await buy(req, res);

      expect(doc.save).not.toHaveBeenCalled();
      expect(encryptAndSend).toHaveBeenCalledWith(
        expect.objectContaining({ point: expect.any(Object) }),
        res, req, ERROR_CODE.ITEMS_NOT_ENOUGH, ERROR_CATEGORY.ERROR_DIALOG, expect.any(String),
      );
    });
  });
});
