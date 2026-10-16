import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response } from 'express';

vi.mock('../../../model/user');
vi.mock('../../../services/crypto/encryptionHelpers');
vi.mock('../../../services/defineService');
vi.mock('../../../middleware/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
  }),
}));

import User from '../../../model/user.js';
import { encryptAndSend } from '../../../services/crypto/encryptionHelpers.js';
import { ERROR_CODE, ERROR_CATEGORY } from '../../../constants/error.codes.js';
import { get, otomoGet, partnerGet, equipLevelup, storageInfo, sale, favoriteSet, leveupAuto, materialSell, equipCapacityInfo, equipCapacityExpand, holdStampSet, partnerLevelup, growthitemGet, otomoSkillRemove } from './box.controller.js';
import prezzi from '../../../json/prezzi-vendita.json' with { type: 'json' };

function mockReqRes(body: Record<string, unknown> = {}) {
  const req = { body, ip: '127.0.0.1', get: vi.fn() } as unknown as Request;
  const res = {} as Response;
  return { req, res };
}

describe('box.controller', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('get', () => {
    it('returns box data for authenticated user', async () => {
      const mockBox = { equipments: [], monument: { hr: 1 } };
      // Il controller lavora su doc.toObject() (sistemaMercenari).
      vi.mocked(User.findOne).mockResolvedValue({
        box: mockBox,
        toObject() { return { _id: 'u1', box: mockBox }; },
      } as never);

      const { req, res } = mockReqRes({ session_id: 'sess-1' });

      await get(req, res);

      expect(encryptAndSend).toHaveBeenCalledWith(
        expect.objectContaining({ box: mockBox }),
        res,
        req,
      );
    });

    it('returns 2004 when user not found', async () => {
      vi.mocked(User.findOne).mockResolvedValue(null);

      const { req, res } = mockReqRes({ session_id: 'bad-sess' });

      await get(req, res);

      expect(encryptAndSend).toHaveBeenCalledWith({}, res, req, ERROR_CODE.NOT_AUTHENTICATED);
    });

    it('returns error on DB failure', async () => {
      vi.mocked(User.findOne).mockRejectedValue(new Error('DB error'));

      const { req, res } = mockReqRes({ session_id: 'sess-1' });

      await get(req, res);

      expect(encryptAndSend).toHaveBeenCalledWith({}, res, req, ERROR_CODE.GENERIC_ERROR, ERROR_CATEGORY.ERROR_DIALOG, 'Get box failed');
    });
  });

  describe('otomoGet', () => {
    it('returns otomos from user box', async () => {
      const mockOtomos = [{ otomo_id: 'OT_001', mst_otomo_id: 123 }];
      vi.mocked(User.findOne).mockResolvedValue({
        box: { otomos: mockOtomos },
      } as never);

      const { req, res } = mockReqRes({ session_id: 'sess-1' });

      await otomoGet(req, res);

      expect(encryptAndSend).toHaveBeenCalledWith(
        expect.objectContaining({ otomos: mockOtomos }),
        res,
        req,
      );
    });

    it('returns error when box is missing', async () => {
      vi.mocked(User.findOne).mockResolvedValue({ box: null } as never);

      const { req, res } = mockReqRes({ session_id: 'sess-1' });

      await otomoGet(req, res);

      expect(encryptAndSend).toHaveBeenCalledWith({}, res, req, ERROR_CODE.GENERIC_ERROR, ERROR_CATEGORY.ERROR_DIALOG, 'Box not found');
    });
  });

  describe('partnerGet', () => {
    it('returns partners from user box', async () => {
      const mockPartners = [{ partner_id: 'PT_001', mst_partner_id: 507850012 }];
      vi.mocked(User.findOne).mockResolvedValue({
        box: { partners: mockPartners },
      } as never);

      const { req, res } = mockReqRes({ session_id: 'sess-1' });

      await partnerGet(req, res);

      expect(encryptAndSend).toHaveBeenCalledWith(
        expect.objectContaining({ partners: mockPartners }),
        res,
        req,
      );
    });

    it('returns error when box is missing', async () => {
      vi.mocked(User.findOne).mockResolvedValue({ box: null } as never);

      const { req, res } = mockReqRes({ session_id: 'sess-1' });

      await partnerGet(req, res);

      expect(encryptAndSend).toHaveBeenCalledWith({}, res, req, ERROR_CODE.GENERIC_ERROR, ERROR_CATEGORY.ERROR_DIALOG, 'Box not found');
    });

    it('returns NOT_AUTHENTICATED when the session is unknown', async () => {
      vi.mocked(User.findOne).mockResolvedValue(null);

      const { req, res } = mockReqRes({ session_id: 'bad' });

      await partnerGet(req, res);

      expect(encryptAndSend).toHaveBeenCalledWith({}, res, req, ERROR_CODE.NOT_AUTHENTICATED);
    });
  });

  describe('equipLevelup', () => {
    /*
     * Over The Wall Zero III (オーヴァーザウォール零Ⅲ), rarity 8 lance. Materials
     * are PER LEVEL: 30 -> 31 needs Dog Wyvern Hide x8, 31 -> 32 Poison Dog
     * Wyvern Hide x8, 32 -> 33 Landslide Dragon Carapace x4 (the game's
     * strengthenNeedMaterialTable). The old code used one fixed set for every
     * level, which is what produced error 81 on real upgrades.
     */
    const MST_LANCE = 1998660426;
    const MATS = [{ mst_material_id: 1642667129, amount: 8 }]; // Dog Wyvern Hide
    const MATS_3LV = [
      { mst_material_id: 1642667129, amount: 8 }, // Dog Wyvern Hide (30->31)
      { mst_material_id: 1400437454, amount: 8 }, // Poison Dog Wyvern Hide (31->32)
      { mst_material_id: 3569549002, amount: 4 }, // Landslide Dragon Carapace (32->33)
    ];

    /**
     * A user holding the lance at `elv`.
     *
     * `mul` is how many complete sets of `mats` the box holds, so anything above
     * 1 leaves a visible remainder.
     *
     * The controller rebuilds box.materials rather than editing it in place, so
     * tests assert on what was handed to findByIdAndUpdate, not on `box`.
     */
    function utenteConLancia(elv: number, zeny = 1_000_000, mul = 3, mats = MATS) {
      const box = {
        zeny,
        equipments: [{ equipment_id: 'EQP_001', elv, mst_equipment_id: MST_LANCE }],
        materials: mats.map((m) => ({ mst_material_id: m.mst_material_id, amount: m.amount * mul })),
      };
      vi.mocked(User.findOne).mockResolvedValue({ id: 'user-1', box } as never);
      return box;
    }

    /** The box exactly as it was written to the database. */
    type BoxSalvato = {
      zeny: number;
      equipments: { elv: number }[];
      materials: { mst_material_id: number; amount: number }[];
    };
    function boxSalvato(): BoxSalvato {
      const [, update] = vi.mocked(User.findByIdAndUpdate).mock.calls[0]!;
      return (update as { box: BoxSalvato }).box;
    }

    it('charges the client-displayed zenny and consumes the materials', async () => {
      utenteConLancia(30);
      vi.mocked(User.findByIdAndUpdate).mockResolvedValue(null);

      const { req, res } = mockReqRes({ session_id: 'sess-1', eqp_obj_id: 'EQP_001', num: 1 });

      await equipLevelup(req, res);

      // 14,981 zenny for level 30 -> 31, as shown by the client.
      const salvato = boxSalvato();
      expect(salvato.equipments[0]!.elv).toBe(31);
      expect(salvato.zeny).toBe(1_000_000 - 14_981);
      // One set consumed per level gained: three sets in the box, one spent.
      for (const need of MATS) {
        const row = salvato.materials.find((m) => m.mst_material_id === need.mst_material_id);
        expect(row).toEqual({ mst_material_id: need.mst_material_id, amount: need.amount * 2 });
      }
    });

    it('sums the per-level materials, so several levels cost more than one', async () => {
      utenteConLancia(30, 1_000_000, 3, MATS_3LV);
      vi.mocked(User.findByIdAndUpdate).mockResolvedValue(null);

      const { req, res } = mockReqRes({ session_id: 'sess-1', eqp_obj_id: 'EQP_001', num: 3 });

      await equipLevelup(req, res);

      // 14,981 + 15,480 + 15,980 = 46,441, the client's figure for 30 -> 33.
      const salvato = boxSalvato();
      expect(salvato.equipments[0]!.elv).toBe(33);
      expect(salvato.zeny).toBe(1_000_000 - 46_441);
      // Each level eats its OWN material; one set of each was spent.
      for (const need of MATS_3LV) {
        const row = salvato.materials.find((m) => m.mst_material_id === need.mst_material_id);
        expect(row).toEqual({ mst_material_id: need.mst_material_id, amount: need.amount * 2 });
      }
    });

    it('sends back the remaining zenny and every material row the client reads', async () => {
      utenteConLancia(30);
      vi.mocked(User.findByIdAndUpdate).mockResolvedValue(null);

      const { req, res } = mockReqRes({ session_id: 'sess-1', eqp_obj_id: 'EQP_001', num: 1 });

      await equipLevelup(req, res);

      // Omitting these is what made the client show 999,999,999.
      expect(encryptAndSend).toHaveBeenCalledWith(
        expect.objectContaining({
          levelup: { equipment: expect.objectContaining({ elv: 31 }) },
          zeny: 1_000_000 - 14_981,
          materials: expect.arrayContaining([
            expect.objectContaining({ mst_material_id: 1642667129, amount: 8 * 2 }),
          ]),
        }),
        res,
        req,
      );
    });

    it('refuses and changes nothing when the player cannot pay', async () => {
      utenteConLancia(30, 100);
      const { req, res } = mockReqRes({ session_id: 'sess-1', eqp_obj_id: 'EQP_001', num: 1 });

      await equipLevelup(req, res);

      // 80 = "You do not have enough zenny".
      expect(encryptAndSend).toHaveBeenCalledWith(
        { zeny: 100 }, res, req, ERROR_CODE.ZENY_NOT_ENOUGH, ERROR_CATEGORY.ERROR_DIALOG, expect.any(String),
      );
      expect(User.findByIdAndUpdate).not.toHaveBeenCalled();
    });

    it('refuses and changes nothing when a material is missing', async () => {
      const box = utenteConLancia(30);
      box.materials = box.materials.map((m) =>
        m.mst_material_id === 1642667129 ? { mst_material_id: m.mst_material_id, amount: 2 } : m,
      );
      const { req, res } = mockReqRes({ session_id: 'sess-1', eqp_obj_id: 'EQP_001', num: 1 });

      await equipLevelup(req, res);

      // 81 = "You do not have enough materials".
      expect(encryptAndSend).toHaveBeenCalledWith(
        expect.objectContaining({ materials: [{ mst_material_id: 1642667129, amount: 2 }] }),
        res, req, ERROR_CODE.MATERIALS_NOT_ENOUGH, ERROR_CATEGORY.ERROR_DIALOG, expect.any(String),
      );
      expect(User.findByIdAndUpdate).not.toHaveBeenCalled();
    });

    it('returns error when equipment not found', async () => {
      vi.mocked(User.findOne).mockResolvedValue({
        id: 'user-1',
        box: { equipments: [] },
      } as never);

      const { req, res } = mockReqRes({
        session_id: 'sess-1',
        eqp_obj_id: 'MISSING',
      });

      await equipLevelup(req, res);

      expect(encryptAndSend).toHaveBeenCalledWith({}, res, req, 2001, 0, 'equipment not found');
    });
  });

  describe('storageInfo', () => {
    it('returns static storage info', () => {
      const { req, res } = mockReqRes();

      storageInfo(req, res);

      expect(encryptAndSend).toHaveBeenCalledWith(
        expect.objectContaining({
          storage_info: expect.objectContaining({
            storage_limit: 5,
            storage_num: 1,
          }),
        }),
        res,
        req,
      );
    });
  });

  // Prezzi veri dai file del gioco (prezzi-vendita.json).
  const [ID_EQUIP, PREZZO_EQUIP] = Object.entries(prezzi.e)[0]!;
  const [ID_MAT, PREZZO_MAT] = Object.entries(prezzi.m)[0]!;
  const pezzo = (equipment_id: string, favorite = 0) => ({ equipment_id, mst_equipment_id: Number(ID_EQUIP), favorite });

  describe('sale', () => {
    it('removes the sold pieces, adds their game price and returns the NEW zeny total', async () => {
      vi.mocked(User.findOne).mockResolvedValue({
        _id: 'u1', equipset: {}, box: { zeny: 1000, points: [], equipments: [pezzo('A'), pezzo('B'), pezzo('C')] },
      } as never);
      vi.mocked(User.updateOne).mockResolvedValue({} as never);
      const { req, res } = mockReqRes({ session_id: 's1', eqp_obj_ids: ['A', 'C', 'NON_ESISTE'] });
      await sale(req, res);

      const totale = 1000 + 2 * PREZZO_EQUIP;
      expect(User.updateOne).toHaveBeenCalledWith({ _id: 'u1' }, { $set: { 'box.equipments': [pezzo('B')], 'box.zeny': totale } });
      expect(encryptAndSend).toHaveBeenCalledWith(
        { equip_sell: { zeny: totale, point: { amount: 0, mst_event_point_id: 0 }, eqp_obj_ids: ['A', 'C'] } }, res, req,
      );
    });

    it('never sells favorites or pieces worn in an equip set', async () => {
      vi.mocked(User.findOne).mockResolvedValue({
        _id: 'u1', equipset: { sets: [{ weapon: { equipment_id: 'W' } }] },
        box: { zeny: 5, points: [], equipments: [pezzo('F', 1), pezzo('W')] },
      } as never);
      const { req, res } = mockReqRes({ session_id: 's1', eqp_obj_ids: ['F', 'W'] });
      await sale(req, res);
      expect(User.updateOne).not.toHaveBeenCalled();
      expect(encryptAndSend).toHaveBeenCalledWith(expect.objectContaining({ equip_sell: expect.objectContaining({ zeny: 5, eqp_obj_ids: [] }) }), res, req);
    });
  });

  describe('materialSell', () => {
    it('sells from all duplicate rows, merges them and returns zeny total + remaining amount', async () => {
      vi.mocked(User.findOne).mockResolvedValue({
        _id: 'u1',
        box: { zeny: 100, materials: [{ mst_material_id: Number(ID_MAT), amount: 3 }, { mst_material_id: 7, amount: 1 }, { mst_material_id: Number(ID_MAT), amount: 4 }] },
      } as never);
      vi.mocked(User.updateOne).mockResolvedValue({} as never);
      const { req, res } = mockReqRes({ session_id: 's1', material: { mst_material_id: Number(ID_MAT), amount: 5 } });
      await materialSell(req, res);

      const totale = 100 + 5 * PREZZO_MAT;
      expect(User.updateOne).toHaveBeenCalledWith({ _id: 'u1' }, {
        $set: { 'box.materials': [{ mst_material_id: 7, amount: 1 }, { mst_material_id: Number(ID_MAT), amount: 2 }], 'box.zeny': totale },
      });
      expect(encryptAndSend).toHaveBeenCalledWith({ zeny: totale, material: { amount: 2, mst_material_id: Number(ID_MAT) } }, res, req);
    });

    it('refuses a material the player does not have (the client would crash looking it up)', async () => {
      vi.mocked(User.findOne).mockResolvedValue({ _id: 'u1', box: { zeny: 1, materials: [] } } as never);
      const { req, res } = mockReqRes({ session_id: 's1', material: { mst_material_id: 123, amount: 1 } });
      await materialSell(req, res);
      expect(User.updateOne).not.toHaveBeenCalled();
      // 94 = "The material you tried to sell is not in your Material Box".
      expect(encryptAndSend).toHaveBeenCalledWith({}, res, req, ERROR_CODE.MATERIAL_NOT_IN_BOX_SELL, ERROR_CATEGORY.ERROR_DIALOG, 'Material not found');
    });
  });

  describe('favoriteSet', () => {
    it('saves the flag and returns the real piece', async () => {
      vi.mocked(User.findOne).mockResolvedValue({ _id: 'u1', box: { equipments: [pezzo('X'), pezzo('Y')] } } as never);
      vi.mocked(User.updateOne).mockResolvedValue({} as never);
      const { req, res } = mockReqRes({ session_id: 's1', is_favorite: 1, eqp_obj_id: 'Y' });
      await favoriteSet(req, res);
      expect(User.updateOne).toHaveBeenCalledWith({ _id: 'u1' }, { $set: { 'box.equipments.1.favorite': 1 } });
      expect(encryptAndSend).toHaveBeenCalledWith({ favorite_set: { equipment: { ...pezzo('Y'), favorite: 1 } } }, res, req);
    });

    it('refuses an unknown piece instead of inventing one', async () => {
      vi.mocked(User.findOne).mockResolvedValue({ _id: 'u1', box: { equipments: [] } } as never);
      const { req, res } = mockReqRes({ session_id: 's1', is_favorite: 1, eqp_obj_id: 'Z' });
      await favoriteSet(req, res);
      expect(User.updateOne).not.toHaveBeenCalled();
      expect(encryptAndSend).toHaveBeenCalledWith({}, res, req, ERROR_CODE.GENERIC_ERROR, ERROR_CATEGORY.ERROR_DIALOG, 'Equipment not found');
    });
  });
});

describe("monument leveupAuto (pietra HR)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });
  const utente = (augite: { amount: number; mst_augite_id: number; mst_monument_type_id: number }[]) => ({
    id: "u1",
    box: { capacity: {}, monument: { hr: 10, mlv: { atk: 1, def: 1, hp: 1, sp: 1 }, augite } },
  });

  it("attack level-up spends 10 攻撃の輝石 and raises atk and HR", async () => {
    const doc = utente([{ amount: 25, mst_augite_id: 2483912298, mst_monument_type_id: 1 }]);
    vi.mocked(User.findOne).mockResolvedValue(doc as never);
    vi.mocked(User.findByIdAndUpdate).mockResolvedValue({} as never);
    const { req, res } = mockReqRes({ session_id: "s1", type: "atk" });
    await leveupAuto(req, res);
    expect(doc.box.monument.augite[0]!.amount).toBe(15);
    expect(doc.box.monument.mlv.atk).toBe(2);
    expect(doc.box.monument.hr).toBe(11);
    expect(User.findByIdAndUpdate).toHaveBeenCalled();
  });

  it("refuses when the right augite is missing (hp augite does not pay for atk)", async () => {
    const doc = utente([{ amount: 9999, mst_augite_id: 2047024966, mst_monument_type_id: 3 }]);
    vi.mocked(User.findOne).mockResolvedValue(doc as never);
    const { req, res } = mockReqRes({ session_id: "s1", type: "atk" });
    await leveupAuto(req, res);
    expect(doc.box.monument.mlv.atk).toBe(1);
    expect(User.findByIdAndUpdate).not.toHaveBeenCalled();
    expect(encryptAndSend).toHaveBeenCalledWith({}, res, req, ERROR_CODE.GENERIC_ERROR, ERROR_CATEGORY.ERROR_DIALOG, "Not enough augite");
  });

  it("refuses with fewer than 10", async () => {
    const doc = utente([{ amount: 9, mst_augite_id: 2047024966, mst_monument_type_id: 3 }]);
    vi.mocked(User.findOne).mockResolvedValue(doc as never);
    const { req, res } = mockReqRes({ session_id: "s1", type: "hp" });
    await leveupAuto(req, res);
    expect(doc.box.monument.augite[0]!.amount).toBe(9);
    expect(User.findByIdAndUpdate).not.toHaveBeenCalled();
  });
});

describe('capacity expansion & stamps', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('capacity info reads eqp_box, not a phantom `equipaggiamento` field', async () => {
    vi.mocked(User.findOne).mockResolvedValue({
      box: { capacity: { eqp_box: 500 }, equipments: [1, 2, 3] },
    } as never);
    const { req, res } = mockReqRes({ session_id: 's1' });
    await equipCapacityInfo(req, res);
    expect(encryptAndSend).toHaveBeenCalledWith({ max: 500, now: 3, price: 0 }, res, req);
  });

  it('expand adds 5 slots, persists, and returns {capacity, payments}', async () => {
    vi.mocked(User.findOne).mockResolvedValue({
      _id: 'mongo-id',
      box: { capacity: { eqp_box: 500 }, equipments: [], payments: [] },
    } as never);
    vi.mocked(User.updateOne).mockResolvedValue({} as never);
    const { req, res } = mockReqRes({ session_id: 's1' });
    await equipCapacityExpand(req, res);

    expect(User.updateOne).toHaveBeenCalledWith(
      { _id: 'mongo-id' },
      { $set: { 'box.capacity.eqp_box': 505 } },
    );
    const [data] = vi.mocked(encryptAndSend).mock.calls[0]!;
    const risposta = data as { capacity: number; payments: { mst_payment_id: number; amount: number }[] };
    // The client parses `capacity` (scalar) and `payments`; without payments it
    // zeroes its Hunter Coin display.
    expect(risposta.capacity).toBe(505);
    expect(Array.isArray(risposta.payments)).toBe(true);
    expect(risposta.payments.length).toBeGreaterThan(0);
  });

  it('hold/set stores the four stamp slots and echoes them', async () => {
    vi.mocked(User.findOne).mockResolvedValue({ _id: 'mongo-id', character_name: 'Hunter' } as never);
    vi.mocked(User.updateOne).mockResolvedValue({} as never);
    const ids = [57688627, 1953985189, 3984466719, 0];
    const { req, res } = mockReqRes({ session_id: 's1', hold_stamp_ids: ids });
    await holdStampSet(req, res);
    expect(User.updateOne).toHaveBeenCalledWith({ _id: 'mongo-id' }, { $set: { hold_stamp_ids: ids } });
    expect(encryptAndSend).toHaveBeenCalledWith({ hold_stamp_ids: ids }, res, req);
  });
});

describe('partner level-up (growth)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  const CIEL = 507850012;
  const ORB = 3170475390; // Ciel Growth Orb: 500 exp

  const partner = (over: Record<string, unknown> = {}) => ({
    partner_id: 'PT_CHAR_ID_001',
    mst_partner_id: CIEL,
    created: 0,
    level: 1,
    exp: 0,
    exp_max: 150,
    level_cap_tier: 0,
    level_max: 20,
    ...over,
  });

  it('feeds a growth item, levels along the real curve and consumes it', async () => {
    const p = partner();
    const box = { partners: [p], growth_items: [{ mst_growth_item_id: ORB, amount: 2 }] };
    vi.mocked(User.findOne).mockResolvedValue({ _id: 'id', character_name: 'H', box } as never);
    vi.mocked(User.updateOne).mockResolvedValue({} as never);

    const { req, res } = mockReqRes({
      session_id: 's1',
      partner_id: 'PT_CHAR_ID_001',
      growth_items: [{ mst_growth_item_id: ORB, amount: 1 }],
    });
    await partnerLevelup(req, res);

    // 500 exp: level 3 (L2 150, L3 350, L4 600); 250 to the next level.
    expect(p.level).toBe(3);
    expect(p.exp).toBe(500);
    expect(p.exp_max).toBe(250);
    expect(box.growth_items).toEqual([{ mst_growth_item_id: ORB, amount: 1 }]);
    const [data] = vi.mocked(encryptAndSend).mock.calls[0]!;
    expect((data as { partner: { level: number; exp: number } }).partner.level).toBe(3);
    expect((data as { partner: { level: number; exp: number } }).partner.exp).toBe(500);
  });

  it('unlocks the next cap tier (limit break) when the exp passes the current cap', async () => {
    // Level 20, exp exactly at the tier-0 cap (cumulative 17,100).
    const p = partner({ level: 20, exp: 17100, exp_max: 3000 });
    const box = { partners: [p], growth_items: [{ mst_growth_item_id: ORB, amount: 1 }] };
    vi.mocked(User.findOne).mockResolvedValue({ _id: 'id', character_name: 'H', box } as never);
    vi.mocked(User.updateOne).mockResolvedValue({} as never);

    const { req, res } = mockReqRes({
      session_id: 's1',
      partner_id: 'PT_CHAR_ID_001',
      growth_items: [{ mst_growth_item_id: ORB, amount: 1 }],
    });
    await partnerLevelup(req, res);

    expect(p.level_cap_tier).toBe(1);
    expect(p.level_max).toBe(30);
    expect(p.level).toBe(20); // 17,600 is still short of level 21 (20,100)
  });

  it('refuses when the growth item is not owned', async () => {
    const box = { partners: [partner()], growth_items: [{ mst_growth_item_id: ORB, amount: 0 }] };
    vi.mocked(User.findOne).mockResolvedValue({ _id: 'id', box } as never);

    const { req, res } = mockReqRes({
      session_id: 's1',
      partner_id: 'PT_CHAR_ID_001',
      growth_items: [{ mst_growth_item_id: ORB, amount: 1 }],
    });
    await partnerLevelup(req, res);

    expect(User.updateOne).not.toHaveBeenCalled();
    expect(encryptAndSend).toHaveBeenCalledWith(
      expect.objectContaining({ growth_items: expect.any(Array) }),
      res, req, ERROR_CODE.MATERIALS_NOT_ENOUGH, ERROR_CATEGORY.ERROR_DIALOG, expect.any(String),
    );
  });
});

describe('growthitemGet', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  // The client hits this right after feeding a partner; it used to 404.
  it('returns every growth item with its count, zeros included', async () => {
    const box = {
      growth_items: [
        { mst_growth_item_id: 3170475390, amount: 4 },
        { mst_growth_item_id: 1436170315, amount: 7 },
      ],
    };
    vi.mocked(User.findOne).mockResolvedValue({ _id: 'id', box } as never);

    const { req, res } = mockReqRes({ session_id: 's1' });
    await growthitemGet(req, res);

    const [data] = vi.mocked(encryptAndSend).mock.calls[0]!;
    const items = (data as { growth_items: { mst_growth_item_id: number; amount: number }[] }).growth_items;
    const perId = new Map(items.map((i) => [i.mst_growth_item_id, i.amount]));
    // The two the box has...
    expect(perId.get(3170475390)).toBe(4);
    expect(perId.get(1436170315)).toBe(7);
    // ...and every catalogue item is present (0 when not owned), so the menu
    // never keeps a stale number for something that hit zero.
    const COLORLESS_ORB = 3582482608;
    expect(perId.has(COLORLESS_ORB)).toBe(true);
    expect(perId.get(COLORLESS_ORB)).toBe(0);
    expect(items.length).toBeGreaterThanOrEqual(12);
  });

  it('returns NOT_AUTHENTICATED for an unknown session', async () => {
    vi.mocked(User.findOne).mockResolvedValue(null);
    const { req, res } = mockReqRes({ session_id: 'bad' });
    await growthitemGet(req, res);
    expect(encryptAndSend).toHaveBeenCalledWith({}, res, req, ERROR_CODE.NOT_AUTHENTICATED);
  });
});

describe('otomo skill remove', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('removes the chosen subskill and returns the palico', async () => {
    const otomo = { otomo_id: 'OT_OTOMO_CHAR_ID_001', mst_otomo_id: 2092467563, exp: 5000, subskill: [2006012238, 1355115484, 2587550611] };
    const box = { otomos: [otomo] };
    vi.mocked(User.findOne).mockResolvedValue({ _id: 'id', character_name: 'H', box } as never);
    vi.mocked(User.updateOne).mockResolvedValue({} as never);

    const { req, res } = mockReqRes({ session_id: 's1', otomo_id: 'OT_OTOMO_CHAR_ID_001', mst_skill_id: 1355115484 });
    await otomoSkillRemove(req, res);

    // Guts is gone and the No Skill placeholder is not left behind either.
    expect(otomo.subskill).toEqual([2587550611]);
    const [data] = vi.mocked(encryptAndSend).mock.calls[0]!;
    expect((data as { otomo: { subskill: number[] } }).otomo.subskill).toEqual([2587550611]);
  });

  it('returns NOT_AUTHENTICATED for an unknown session', async () => {
    vi.mocked(User.findOne).mockResolvedValue(null);
    const { req, res } = mockReqRes({ session_id: 'bad' });
    await otomoSkillRemove(req, res);
    expect(encryptAndSend).toHaveBeenCalledWith({}, res, req, ERROR_CODE.NOT_AUTHENTICATED);
  });
});
