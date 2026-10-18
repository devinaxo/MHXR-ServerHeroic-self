import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response } from 'express';

vi.mock('../../../../model/user');
vi.mock('../../../../services/crypto/encryptionHelpers');
vi.mock('../../../../middleware/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
  }),
}));

import User from '../../../../model/user.js';
import { encryptAndSend } from '../../../../services/crypto/encryptionHelpers.js';
import { ERROR_CODE, ERROR_CATEGORY } from '../../../../constants/error.codes.js';
import {
  equipSetGet,
  equipSetSet,
  equipSetSocialGet,
  equipSetSocialSet,
} from './userEquipSet.controller.js';

function mockReqRes(body: Record<string, unknown> = {}) {
  const req = { body, ip: '127.0.0.1', get: vi.fn() } as unknown as Request;
  const res = {} as Response;
  return { req, res };
}

describe('userEquipSet.controller', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('equipSetGet', () => {
    it('returns equipset for authenticated user', async () => {
      const mockEquipset = {
        capacity_eqp_set: 5,
        equip_sets: [],
        selected_equip_set_index: 1,
      };
      vi.mocked(User.findOne).mockResolvedValue({
        equipset: mockEquipset,
        toObject() { return { _id: 'u1', equipset: mockEquipset }; },
      } as never);

      const { req, res } = mockReqRes({ session_id: 'sess-1' });

      await equipSetGet(req, res);

      expect(encryptAndSend).toHaveBeenCalledWith(
        expect.objectContaining({ capacity_eqp_set: 5 }),
        res,
        req,
      );
    });

    it('returns 2004 when user not found', async () => {
      vi.mocked(User.findOne).mockResolvedValue(null);

      const { req, res } = mockReqRes({ session_id: 'bad' });

      await equipSetGet(req, res);

      expect(encryptAndSend).toHaveBeenCalledWith({}, res, req, ERROR_CODE.NOT_AUTHENTICATED);
    });

    it('never rewrites the stored sets (no fabricated clones on the database)', async () => {
      const equipset = {
        capacity_eqp_set: 5,
        selected_equip_set_index: 1,
        equip_sets: [
          {
            index: 1,
            weapon: { equipment_id: 'W1' },
            partner_equip_sets: [{ mst_partner_id: 507850012, weapon: { equipment_id: 'W1' } }],
          },
        ],
      };
      const box = {
        equipments: [{ equipment_id: 'W1', mst_equipment_id: 1 }],
        partners: [{ mst_partner_id: 507850012 }],
      };
      vi.mocked(User.findOne).mockResolvedValue({
        equipset,
        toObject() { return { _id: 'u1', box, equipset }; },
      } as never);

      const { req, res } = mockReqRes({ session_id: 'sess-1' });

      await equipSetGet(req, res);

      // Nessun set inventato scritto sul database: al massimo si aggiunge al box
      // l'arma predefinita che manca davvero.
      for (const call of vi.mocked(User.updateOne).mock.calls) {
        expect(call[1]).not.toHaveProperty('$set');
      }
      const inviato = vi.mocked(encryptAndSend).mock.calls[0]![0] as {
        equip_sets: { index: number; partner_equip_sets: unknown[] }[];
      };
      expect(inviato.equip_sets.map((s) => s.index)).toEqual([1, 2, 3, 4, 5]);
      // I cloni portano con se' i mercenari, non liste vuote (crash sul cambio set).
      expect(inviato.equip_sets[1]!.partner_equip_sets).toHaveLength(1);
    });

    it('returns error on DB failure', async () => {
      vi.mocked(User.findOne).mockRejectedValue(new Error('DB error'));

      const { req, res } = mockReqRes({ session_id: 'sess-1' });

      await equipSetGet(req, res);

      expect(encryptAndSend).toHaveBeenCalledWith({}, res, req, ERROR_CODE.GENERIC_ERROR, ERROR_CATEGORY.ERROR_DIALOG, 'Get equip set failed');
    });
  });

  describe('equipSetSet', () => {
    it('updates equipset when equip_sets provided', async () => {
      const mockDoc = {
        id: 'user-1',
        equipset: {
          capacity_eqp_set: 5,
          equip_sets: [],
          selected_equip_set_index: 1,
        },
        toObject() { return { _id: 'user-1', box: { equipments: [], partners: [] }, equipset: this.equipset }; },
      };
      vi.mocked(User.findOne).mockResolvedValue(mockDoc as never);
      vi.mocked(User.findByIdAndUpdate).mockResolvedValue(null);

      const { req, res } = mockReqRes({
        session_id: 'sess-1',
        equip_sets: [{ index: 1 }],
        selected_equip_set_index: 2,
        capacity_eqp_set: 10,
      });

      await equipSetSet(req, res);

      expect(User.findByIdAndUpdate).toHaveBeenCalled();
      expect(encryptAndSend).toHaveBeenCalledWith(
        expect.objectContaining({ selected_equip_set_index: 2 }),
        res,
        req,
      );
    });

    it('returns 2004 when user has no equipset', async () => {
      vi.mocked(User.findOne).mockResolvedValue({
        equipset: null,
      } as never);

      const { req, res } = mockReqRes({ session_id: 'sess-1' });

      await equipSetSet(req, res);

      expect(encryptAndSend).toHaveBeenCalledWith({}, res, req, ERROR_CODE.NOT_AUTHENTICATED);
    });

    it('merges a partial save by index instead of dropping the other sets', async () => {
      const equipset = {
        capacity_eqp_set: 5,
        selected_equip_set_index: 1,
        equip_sets: [
          { index: 1, weapon: { equipment_id: 'W1' } },
          { index: 2, weapon: { equipment_id: 'W2' }, arm: { equipment_id: 'A2' } },
        ],
      };
      const box = {
        equipments: [{ equipment_id: 'W1', mst_equipment_id: 1 }, { equipment_id: 'W2', mst_equipment_id: 2 }],
        partners: [],
      };
      const mockDoc = {
        id: 'user-1',
        equipset,
        toObject() { return { _id: 'user-1', box, equipset }; },
      };
      vi.mocked(User.findOne).mockResolvedValue(mockDoc as never);
      vi.mocked(User.findByIdAndUpdate).mockResolvedValue(null);
      vi.mocked(User.updateOne).mockResolvedValue(null as never);

      const { req, res } = mockReqRes({
        session_id: 'sess-1',
        equip_sets: [{ index: 1, weapon: { equipment_id: 'W1' }, arm: { equipment_id: 'A1' } }],
        selected_equip_set_index: 2,
        capacity_eqp_set: 5,
      });

      await equipSetSet(req, res);

      const salvati = vi.mocked(User.updateOne).mock.calls[0]![1] as { $set: { 'equipset.equip_sets': { index: number; arm?: { equipment_id: string } }[] } };
      const set = salvati.$set['equipset.equip_sets'];
      expect(set.map((s) => s.index)).toEqual([1, 2]);
      expect(set[0]!.arm?.equipment_id).toBe('A1');
      expect(set[1]!.arm?.equipment_id).toBe('A2');
    });

    it('saves the selected index even when no sets are sent', async () => {
      const equipset = { capacity_eqp_set: 5, selected_equip_set_index: 1, equip_sets: [{ index: 1, weapon: { equipment_id: 'W1' } }] };
      const box = { equipments: [{ equipment_id: 'W1', mst_equipment_id: 1 }], partners: [] };
      const mockDoc = {
        id: 'user-1',
        equipset,
        toObject() { return { _id: 'user-1', box, equipset }; },
      };
      vi.mocked(User.findOne).mockResolvedValue(mockDoc as never);
      vi.mocked(User.findByIdAndUpdate).mockResolvedValue(null);

      const { req, res } = mockReqRes({
        session_id: 'sess-1',
        equip_sets: [],
        selected_equip_set_index: 3,
        capacity_eqp_set: 5,
      });

      await equipSetSet(req, res);

      expect(User.findByIdAndUpdate).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({ 'equipset.selected_equip_set_index': 3 }),
      );
    });
  });

  describe('equipSetSocialGet', () => {
    it('returns social equip sets', async () => {
      const mockSets = [{ is_used: 0, mst_partner_id: 0 }];
      vi.mocked(User.findOne).mockResolvedValue({
        social_equip_sets: mockSets,
      } as never);

      const { req, res } = mockReqRes({ session_id: 'sess-1' });

      await equipSetSocialGet(req, res);

      expect(encryptAndSend).toHaveBeenCalledWith(
        expect.objectContaining({ social_equip_sets: mockSets }),
        res,
        req,
      );
    });
  });

  describe('equipSetSocialSet', () => {
    it('updates social equip sets', async () => {
      const mockDoc = {
        id: 'user-1',
        social_equip_sets: [],
      };
      vi.mocked(User.findOne).mockResolvedValue(mockDoc as never);
      vi.mocked(User.findByIdAndUpdate).mockResolvedValue(null);

      const { req, res } = mockReqRes({
        session_id: 'sess-1',
        social_equip_sets: [{ is_used: 1, mst_partner_id: 507850012 }],
      });

      await equipSetSocialSet(req, res);

      expect(User.findByIdAndUpdate).toHaveBeenCalled();
      expect(encryptAndSend).toHaveBeenCalled();
    });

    it('returns 2004 when user not found', async () => {
      vi.mocked(User.findOne).mockResolvedValue(null);

      const { req, res } = mockReqRes({ session_id: 'bad' });

      await equipSetSocialSet(req, res);

      expect(encryptAndSend).toHaveBeenCalledWith({}, res, req, ERROR_CODE.NOT_AUTHENTICATED);
    });
  });
});
