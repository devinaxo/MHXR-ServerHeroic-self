import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response } from 'express';

vi.mock('../../../model/user');
vi.mock('../../../model/questSheet');
vi.mock('../../../model/presents');
vi.mock('../../../model/events/eventMeta');
vi.mock('../../../model/events/assualts');
vi.mock('../../../model/events/m16');
vi.mock('../../../model/events/score');
vi.mock('../../../model/events/standing');
vi.mock('../../../model/events/tickets');
vi.mock('../../../model/events/tour');
vi.mock('../../../model/events/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../model/events/utils.js')>();
  return {
    ...actual,
    enrichEvent: vi.fn((data: unknown) => data),
  };
});
vi.mock('../../../services/crypto/encryptionHelpers');
vi.mock('../../../middleware/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
  }),
}));
vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
}));

import User from '../../../model/user.js';
import QuestSheet from '../../../model/questSheet.js';
import Present from '../../../model/presents.js';
import { Event } from '../../../model/events/index.js';
import AssualtEvents from '../../../model/events/assualts.js';
import M16Events from '../../../model/events/m16.js';
import ScoreEvents from '../../../model/events/score.js';
import StandingEvents from '../../../model/events/standing.js';
import TicketEvents from '../../../model/events/tickets.js';
import TourEvents from '../../../model/events/tour.js';
import { encryptAndSend } from '../../../services/crypto/encryptionHelpers.js';
import { ERROR_CODE, ERROR_CATEGORY } from '../../../constants/error.codes.js';
import { questProgress, questResultEnd, eternalStart, eternalAll } from './quest.controller.js';
import { eventTicketFree, eventNormalStart, eventTicketStart, eventScoreStart, eventListAll } from './questEvent.controller.js';
import { islandStart, islandEnd, islandMapAll, rewardExchange } from './questIsland.controller.js';
import {
  PUNTI_PER_QUEST,
  PUNTI_PER_RISCATTO,
  TRADE_POINT_ID,
} from '../../../services/tradePointsService.js';

function mockReqRes(body: Record<string, unknown> = {}) {
  const req = { body, ip: '127.0.0.1', get: vi.fn() } as unknown as Request;
  const res = {} as Response;
  return { req, res };
}

describe('quest.controller', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('questProgress', () => {
    it('returns progress data with is_progress -1', () => {
      const { req, res } = mockReqRes({});
      questProgress(req, res);
      expect(encryptAndSend).toHaveBeenCalledWith(
        expect.objectContaining({ is_progress: -1, mst_quest_id: 0 }),
        res,
        req,
      );
    });
  });

  describe('questResultEnd', () => {
    it('returns empty data', () => {
      const { req, res } = mockReqRes({});
      questResultEnd(req, res);
      expect(encryptAndSend).toHaveBeenCalledWith({}, res, req);
    });
  });

  describe('eventTicketFree', () => {
    it('lists every ticket quest from the database as free', async () => {
      vi.mocked(TicketEvents.distinct).mockResolvedValue([111, 222] as never);
      const { req, res } = mockReqRes({});
      await eventTicketFree(req, res);
      expect(encryptAndSend).toHaveBeenCalledWith(
        expect.objectContaining({
          infos: expect.arrayContaining([
            expect.objectContaining({ free_group_id: 1, max_free_count: 10 }),
          ]),
          quests: [
            { free_group_id: 1, mst_quest_id: 111 },
            { free_group_id: 1, mst_quest_id: 222 },
          ],
        }),
        res,
        req,
      );
    });
  });

  describe('eventNormalStart', () => {
    it('returns QUEST_INFO_FAILED when quest has no blocks', async () => {
      vi.mocked(QuestSheet.findOne).mockResolvedValue({ mBlocks: [] } as never);
      const { req, res } = mockReqRes({ mst_quest_id: 123 });
      await eventNormalStart(req, res);
      expect(encryptAndSend).toHaveBeenCalledWith({}, res, req, ERROR_CODE.QUEST_INFO_FAILED);
    });

    it('returns QUEST_INFO_FAILED when quest not found', async () => {
      vi.mocked(QuestSheet.findOne).mockResolvedValue(null);
      const { req, res } = mockReqRes({ mst_quest_id: 123 });
      await eventNormalStart(req, res);
      expect(encryptAndSend).toHaveBeenCalledWith({}, res, req, ERROR_CODE.QUEST_INFO_FAILED);
    });

    it('returns instance data with block_list on success', async () => {
      vi.mocked(QuestSheet.findOne).mockResolvedValue({ mBlocks: [100, 200] } as never);
      const { req, res } = mockReqRes({ mst_quest_id: 999 });
      await eventNormalStart(req, res);
      expect(encryptAndSend).toHaveBeenCalledWith(
        expect.objectContaining({
          instance_data: expect.objectContaining({
            mst_quest_id: 999,
            block_list: expect.arrayContaining([
              expect.objectContaining({ block_idx: 1, mst_block_id: 100 }),
              expect.objectContaining({ block_idx: 2, mst_block_id: 200 }),
            ]),
          }),
        }),
        res,
        req,
      );
    });

    it('returns error on DB failure', async () => {
      vi.mocked(QuestSheet.findOne).mockRejectedValue(new Error('DB error'));
      const { req, res } = mockReqRes({ mst_quest_id: 123 });
      await eventNormalStart(req, res);
      expect(encryptAndSend).toHaveBeenCalledWith(
        {},
        res,
        req,
        ERROR_CODE.GENERIC_ERROR,
        ERROR_CATEGORY.ERROR_DIALOG,
        'Event normal start failed',
      );
    });
  });

  describe('eventTicketStart', () => {
    it('returns QUEST_INFO_FAILED when quest not found', async () => {
      vi.mocked(QuestSheet.findOne).mockResolvedValue(null);
      const { req, res } = mockReqRes({ mst_quest_id: 123 });
      await eventTicketStart(req, res);
      expect(encryptAndSend).toHaveBeenCalledWith({}, res, req, ERROR_CODE.QUEST_INFO_FAILED);
    });

    it('populates block_list from quest blocks', async () => {
      vi.mocked(QuestSheet.findOne).mockResolvedValue({ mBlocks: [300] } as never);
      const { req, res } = mockReqRes({ mst_quest_id: 500 });
      await eventTicketStart(req, res);
      expect(encryptAndSend).toHaveBeenCalledWith(
        expect.objectContaining({
          instance_data: expect.objectContaining({
            block_list: [expect.objectContaining({ block_idx: 1, mst_block_id: 300 })],
          }),
        }),
        res,
        req,
      );
    });
  });

  describe('eventScoreStart', () => {
    it('returns QUEST_INFO_FAILED when quest not found', async () => {
      vi.mocked(QuestSheet.findOne).mockResolvedValue(null);
      const { req, res } = mockReqRes({ mst_quest_id: 123 });
      await eventScoreStart(req, res);
      expect(encryptAndSend).toHaveBeenCalledWith({}, res, req, ERROR_CODE.QUEST_INFO_FAILED);
    });

    it('returns instance data on success', async () => {
      vi.mocked(QuestSheet.findOne).mockResolvedValue({ mBlocks: [10, 20] } as never);
      const { req, res } = mockReqRes({ mst_quest_id: 777 });
      await eventScoreStart(req, res);
      expect(encryptAndSend).toHaveBeenCalledWith(
        expect.objectContaining({
          instance_data: expect.objectContaining({ mst_quest_id: 777 }),
        }),
        res,
        req,
      );
    });
  });

  describe('eternalStart', () => {
    it('returns QUEST_INFO_FAILED when quest not found', async () => {
      vi.mocked(QuestSheet.findOne).mockResolvedValue(null);
      const { req, res } = mockReqRes({ mst_quest_id: 123 });
      await eternalStart(req, res);
      expect(encryptAndSend).toHaveBeenCalledWith({}, res, req, ERROR_CODE.QUEST_INFO_FAILED);
    });

    it('returns instance data with blocks on success', async () => {
      vi.mocked(QuestSheet.findOne).mockResolvedValue({ mBlocks: [50] } as never);
      const { req, res } = mockReqRes({ mst_quest_id: 2002926758 });
      await eternalStart(req, res);
      expect(encryptAndSend).toHaveBeenCalledWith(
        expect.objectContaining({
          instance_data: expect.objectContaining({
            mst_quest_id: 2002926758,
            block_list: [expect.objectContaining({ mst_block_id: 50 })],
          }),
        }),
        res,
        req,
      );
    });
  });

  describe('eternalAll', () => {
    it('returns eternal nodes data', () => {
      const { req, res } = mockReqRes({});
      eternalAll(req, res);
      expect(encryptAndSend).toHaveBeenCalledWith(
        expect.objectContaining({
          eternal_nodes: expect.arrayContaining([
            expect.objectContaining({ mst_eternal_node_id: 1 }),
          ]),
        }),
        res,
        req,
      );
    });
  });

  describe('eventListAll', () => {
    function mockEventExec(data: Record<string, unknown>) {
      return { exec: vi.fn().mockResolvedValue(data) };
    }
    function mockArrayExec(data: { toObject: () => unknown }[]) {
      return { exec: vi.fn().mockResolvedValue(data) };
    }

    it('returns event list data on success', async () => {
      const eventData = {
        toObject: () => ({
          big_node_order_array: [90000],
          next_day_start: 0,
          next_latest_node_infos: [],
          now_latest_node_info_remain: 0,
          now_latest_node_infos: [],
        }),
      };
      vi.mocked(Event.findOne).mockReturnValue(mockEventExec(eventData) as never);

      const emptyArray: never[] = [];
      vi.mocked(AssualtEvents.find).mockReturnValue(mockArrayExec(emptyArray) as never);
      vi.mocked(M16Events.find).mockReturnValue(mockArrayExec(emptyArray) as never);
      vi.mocked(ScoreEvents.find).mockReturnValue(mockArrayExec(emptyArray) as never);
      vi.mocked(StandingEvents.find).mockReturnValue(mockArrayExec(emptyArray) as never);
      vi.mocked(TicketEvents.find).mockReturnValue(mockArrayExec(emptyArray) as never);
      vi.mocked(TourEvents.find).mockReturnValue(mockArrayExec(emptyArray) as never);

      const { req, res } = mockReqRes({});
      await eventListAll(req, res);

      expect(encryptAndSend).toHaveBeenCalledWith(
        expect.objectContaining({
          big_node_order_array: [90000],
          event_list: expect.objectContaining({
            assault: [],
            m16: [],
          }),
        }),
        res,
        req,
      );
    });

    it('returns error on DB failure', async () => {
      vi.mocked(Event.findOne).mockReturnValue({
        exec: vi.fn().mockRejectedValue(new Error('fail')),
      } as never);

      const { req, res } = mockReqRes({});
      await eventListAll(req, res);

      expect(encryptAndSend).toHaveBeenCalledWith(
        {},
        res,
        req,
        ERROR_CODE.GENERIC_ERROR,
        ERROR_CATEGORY.ERROR_DIALOG,
        'Event list failed',
      );
    });
  });

  describe('islandStart', () => {
    it('returns NOT_AUTHENTICATED when user not found', async () => {
      vi.mocked(User.findOne).mockResolvedValue(null);
      vi.mocked(QuestSheet.findOne).mockResolvedValue({ mBlocks: [1] } as never);
      const { req, res } = mockReqRes({ mst_quest_id: 100, session_id: 'bad' });
      await islandStart(req, res);
      expect(encryptAndSend).toHaveBeenCalledWith({}, res, req, ERROR_CODE.NOT_AUTHENTICATED);
    });

    it('enables the charm (enable_talisman) when a released charm is owned', async () => {
      // Rookie fire jewel: released (is_awake=1) but not yet saved into a set.
      vi.mocked(User.findOne).mockResolvedValue({
        cleared_quests: [],
        equipset: { selected_equip_set_index: 1, equip_sets: [{ index: 1, talisman: { equipment_id: 'NO_EQUIP' } }] },
        box: { equipments: [{ equipment_id: 'OD_OMA1387', mst_equipment_id: 3529887655, is_awake: 1 }] },
      } as never);
      vi.mocked(QuestSheet.findOne).mockResolvedValue({ mBlocks: [10] } as never);
      vi.mocked(User.findOneAndUpdate).mockResolvedValue({});
      const { req, res } = mockReqRes({ mst_quest_id: 100, session_id: 'sess-1' });
      await islandStart(req, res);
      expect(encryptAndSend).toHaveBeenCalledWith(
        expect.objectContaining({ instance_data: expect.objectContaining({ enable_talisman: 1 }) }),
        res,
        req,
      );
    });

    it('returns QUEST_INFO_FAILED when quest has no blocks', async () => {
      vi.mocked(User.findOne).mockResolvedValue({ cleared_quests: [] } as never);
      vi.mocked(QuestSheet.findOne).mockResolvedValue(null);
      vi.mocked(User.findOneAndUpdate).mockResolvedValue({});
      const { req, res } = mockReqRes({ mst_quest_id: 100, session_id: 'sess-1' });
      await islandStart(req, res);
      expect(encryptAndSend).toHaveBeenCalledWith({}, res, req, ERROR_CODE.QUEST_INFO_FAILED);
    });

    it('adds quest to cleared_quests on first play', async () => {
      vi.mocked(User.findOne).mockResolvedValue({ cleared_quests: [] } as never);
      vi.mocked(QuestSheet.findOne).mockResolvedValue({ mBlocks: [10] } as never);
      vi.mocked(User.findOneAndUpdate).mockResolvedValue({});
      const { req, res } = mockReqRes({ mst_quest_id: 100, session_id: 'sess-1' });
      await islandStart(req, res);

      expect(User.findOneAndUpdate).toHaveBeenCalledWith(
        { current_session: 'sess-1' },
        { cleared_quests: [{ mst_quest_id: 100 }], otomo_avviati: { mst_quest_id: 100, otomo_ids: [] } },
        { new: true },
      );
      expect(encryptAndSend).toHaveBeenCalledWith(
        expect.objectContaining({
          instance_data: expect.objectContaining({ mst_quest_id: 100 }),
        }),
        res,
        req,
      );
    });

    it('does not duplicate cleared_quests entry on replay', async () => {
      vi.mocked(User.findOne).mockResolvedValue({
        cleared_quests: [{ mst_quest_id: 100 }],
      } as never);
      vi.mocked(QuestSheet.findOne).mockResolvedValue({ mBlocks: [10] } as never);
      vi.mocked(User.findOneAndUpdate).mockResolvedValue({});
      const { req, res } = mockReqRes({ mst_quest_id: 100, session_id: 'sess-1' });
      await islandStart(req, res);

      expect(User.findOneAndUpdate).toHaveBeenCalledWith(
        { current_session: 'sess-1' },
        { cleared_quests: [{ mst_quest_id: 100 }], otomo_avviati: { mst_quest_id: 100, otomo_ids: [] } },
        { new: true },
      );
    });

    // The client sends `otomo` as a bare array of otomo_id strings
    // (cMHiParser::getArrayString); we remember them for the end-of-quest exp.
    it('remembers the palicos that set off', async () => {
      vi.mocked(User.findOne).mockResolvedValue({ cleared_quests: [] } as never);
      vi.mocked(QuestSheet.findOne).mockResolvedValue({ mBlocks: [10] } as never);
      vi.mocked(User.findOneAndUpdate).mockResolvedValue({});
      const { req, res } = mockReqRes({
        mst_quest_id: 100,
        session_id: 'sess-1',
        otomo: ['OT_OTOMO_CHAR_ID_118', 'OT_OTOMO_CHAR_ID_119'],
      });
      await islandStart(req, res);

      expect(User.findOneAndUpdate).toHaveBeenCalledWith(
        { current_session: 'sess-1' },
        expect.objectContaining({
          otomo_avviati: { mst_quest_id: 100, otomo_ids: ['OT_OTOMO_CHAR_ID_118', 'OT_OTOMO_CHAR_ID_119'] },
        }),
        { new: true },
      );
    });
  });

  describe('islandEnd', () => {
    it('returns NOT_AUTHENTICATED when user not found', async () => {
      vi.mocked(QuestSheet.findOne).mockResolvedValue(null);
      vi.mocked(User.findOne).mockResolvedValue(null);
      const { req, res } = mockReqRes({
        mst_quest_id: 100,
        clear_time: 30,
        session_id: 'bad',
      });
      await islandEnd(req, res);
      expect(encryptAndSend).toHaveBeenCalledWith({}, res, req, ERROR_CODE.NOT_AUTHENTICATED);
    });

    it('inserts new cleared quest with clear_time', async () => {
      vi.mocked(QuestSheet.findOne).mockResolvedValue({ mRewardItemList: [] } as never);
      vi.mocked(User.findOne).mockResolvedValue({ cleared_quests: [] } as never);
      vi.mocked(User.findOneAndUpdate).mockResolvedValue({});
      const { req, res } = mockReqRes({
        mst_quest_id: 200,
        clear_time: 45,
        session_id: 'sess-1',
      });
      await islandEnd(req, res);

      expect(User.findOneAndUpdate).toHaveBeenCalledWith(
        { current_session: 'sess-1' },
        { cleared_quests: [{ mst_quest_id: 200, clear_time: 45 }] },
        { new: true },
      );
    });

    it('updates clear_time for already cleared quest', async () => {
      vi.mocked(QuestSheet.findOne).mockResolvedValue({ mRewardItemList: [] } as never);
      vi.mocked(User.findOne).mockResolvedValue({
        cleared_quests: [{ mst_quest_id: 200, clear_time: 60 }],
      } as never);
      vi.mocked(User.findOneAndUpdate).mockResolvedValue({});
      const { req, res } = mockReqRes({
        mst_quest_id: 200,
        clear_time: 30,
        session_id: 'sess-1',
      });
      await islandEnd(req, res);

      expect(User.findOneAndUpdate).toHaveBeenCalledWith(
        { current_session: 'sess-1' },
        { cleared_quests: [{ mst_quest_id: 200, clear_time: 30 }] },
        { new: true },
      );
    });

    it('returns reward data on success', async () => {
      // Pin the zenny range so the assertion is deterministic.
      const prev = process.env.QUEST_ZENY;
      process.env.QUEST_ZENY = '500-500';
      try {
        vi.mocked(QuestSheet.findOne).mockResolvedValue({ mRewardItemList: [] } as never);
        vi.mocked(User.findOne).mockResolvedValue({ cleared_quests: [] } as never);
        vi.mocked(User.findOneAndUpdate).mockResolvedValue({});
        const { req, res } = mockReqRes({
          mst_quest_id: 200,
          clear_time: 45,
          session_id: 'sess-1',
        });
        await islandEnd(req, res);

        expect(encryptAndSend).toHaveBeenCalledWith(
          expect.objectContaining({
            rewards: expect.objectContaining({
              zeny: 500,
            }),
          }),
          res,
          req,
        );
      } finally {
        if (prev === undefined) delete process.env.QUEST_ZENY;
        else process.env.QUEST_ZENY = prev;
      }
    });

    it('places the player on the island of a Special Request (subjugation) quest', async () => {
      vi.mocked(QuestSheet.findOne).mockResolvedValue({ mRewardItemList: [] } as never);
      vi.mocked(User.findOne).mockResolvedValue({ cleared_quests: [] } as never);
      vi.mocked(User.findOneAndUpdate).mockResolvedValue({});
      const { req, res } = mockReqRes({
        mst_quest_id: 141015936, // 3-10 美女の落し物, a subjugation quest on island 2
        clear_time: 45,
        session_id: 'sess-1',
      });
      await islandEnd(req, res);

      expect(encryptAndSend).toHaveBeenCalledWith(
        expect.objectContaining({ mst_part_id: 2053326309 }),
        res,
        req,
      );
    });

    it('can leave a new palico after an island quest', async () => {
      const prev = process.env.OTOMO_ENCOUNTER_CHANCE;
      process.env.OTOMO_ENCOUNTER_CHANCE = '100';
      try {
        vi.mocked(QuestSheet.findOne).mockResolvedValue({ mRewardItemList: [] } as never);
        const box = { otomos: [] as { otomo_id: string }[], materials: [] as unknown[] };
        vi.mocked(User.findOne).mockResolvedValue({ character_name: 'H', cleared_quests: [], box } as never);
        vi.mocked(User.findOneAndUpdate).mockResolvedValue({});

        const { req, res } = mockReqRes({ mst_quest_id: 141015936, clear_time: 45, session_id: 'sess-1' });
        await islandEnd(req, res);

        expect(box.otomos).toHaveLength(1);
        const [data] = vi.mocked(encryptAndSend).mock.calls[0]!;
        expect((data as { get_mst_otomo_id: number }).get_mst_otomo_id).not.toBe(0);
        expect(User.findOneAndUpdate).toHaveBeenCalledWith(
          { current_session: 'sess-1' },
          expect.objectContaining({ box: expect.objectContaining({ otomos: box.otomos }) }),
          { new: true },
        );
      } finally {
        if (prev === undefined) delete process.env.OTOMO_ENCOUNTER_CHANCE;
        else process.env.OTOMO_ENCOUNTER_CHANCE = prev;
      }
    });

    it('does not hand out a palico on a non-island quest', async () => {
      const prev = process.env.OTOMO_ENCOUNTER_CHANCE;
      process.env.OTOMO_ENCOUNTER_CHANCE = '100';
      try {
        vi.mocked(QuestSheet.findOne).mockResolvedValue({ mRewardItemList: [] } as never);
        const box = { otomos: [] as { otomo_id: string }[], materials: [] as unknown[] };
        vi.mocked(User.findOne).mockResolvedValue({ character_name: 'H', cleared_quests: [], box } as never);
        vi.mocked(User.findOneAndUpdate).mockResolvedValue({});

        const { req, res } = mockReqRes({ mst_quest_id: 200, clear_time: 45, session_id: 'sess-1' });
        await islandEnd(req, res);

        expect(box.otomos).toHaveLength(0);
        const [data] = vi.mocked(encryptAndSend).mock.calls[0]!;
        expect((data as { get_mst_otomo_id: number }).get_mst_otomo_id).toBe(0);
      } finally {
        if (prev === undefined) delete process.env.OTOMO_ENCOUNTER_CHANCE;
        else process.env.OTOMO_ENCOUNTER_CHANCE = prev;
      }
    });

    it('sends a Special Request reward to the present box, not the inventory', async () => {
      const prev = process.env.QUEST_CRESCITA_CHANCE;
      process.env.QUEST_CRESCITA_CHANCE = '0';
      try {
        vi.mocked(QuestSheet.findOne).mockResolvedValue({
          mRewardItemList: [{ mItemHash: '1926212767', mProbScale: '10', mRewardType: '0' }],
        } as never);
        const box = { materials: [] as { mst_material_id: number; amount: number }[] };
        vi.mocked(User.findOne).mockResolvedValue({ uu_id: 'uu1', character_name: 'H', cleared_quests: [], box } as never);
        vi.mocked(User.findOneAndUpdate).mockResolvedValue({});
        vi.mocked(Present.create).mockResolvedValue({} as never);

        const { req, res } = mockReqRes({ mst_quest_id: 141015936, clear_time: 45, session_id: 'sess-1' });
        await islandEnd(req, res);

        expect(Present.create).toHaveBeenCalledWith(expect.objectContaining({ uu_id: 'uu1' }));
        const content = vi.mocked(Present.create).mock.calls[0]![0].content as { materials?: { mst_material_id: number }[] };
        expect(content.materials?.[0]?.mst_material_id).toBe(1926212767);
        // Delivered through the present box, so the inventory must stay empty.
        expect(box.materials).toEqual([]);
      } finally {
        if (prev === undefined) delete process.env.QUEST_CRESCITA_CHANCE;
        else process.env.QUEST_CRESCITA_CHANCE = prev;
      }
    });

    it.runIf(PUNTI_PER_QUEST > 0)('pays Trade Points for the quest and shows them in the reward list', async () => {
      const prev = process.env.QUEST_CRESCITA_CHANCE;
      process.env.QUEST_CRESCITA_CHANCE = '0';
      try {
        vi.mocked(QuestSheet.findOne).mockResolvedValue({ mRewardItemList: [] } as never);
        const box = {
          points: [] as { mst_event_point_id: number; amount: number }[],
          materials: [] as { mst_material_id: number; amount: number }[],
        };
        vi.mocked(User.findOne).mockResolvedValue({ uu_id: 'uu1', character_name: 'H', cleared_quests: [], box } as never);
        vi.mocked(User.findOneAndUpdate).mockResolvedValue({});

        const { req, res } = mockReqRes({ mst_quest_id: 200, clear_time: 45, session_id: 'sess-1' });
        await islandEnd(req, res);

        // Credited to the box...
        expect(box.points.find((p) => p.mst_event_point_id === TRADE_POINT_ID)?.amount).toBe(PUNTI_PER_QUEST);
        // ...and shown in the first reward slot, so what is seen is what is given.
        const [data] = vi.mocked(encryptAndSend).mock.calls[0]!;
        const rewards = (data as { rewards: { normal_reward: { other_list_add: { item_list: { points?: unknown[] } }[] } } }).rewards;
        expect(rewards.normal_reward.other_list_add[0]!.item_list.points).toEqual([
          { amount: PUNTI_PER_QUEST, mst_event_point_id: TRADE_POINT_ID },
        ]);
      } finally {
        if (prev === undefined) delete process.env.QUEST_CRESCITA_CHANCE;
        else process.env.QUEST_CRESCITA_CHANCE = prev;
      }
    });

    it('returns error on DB failure', async () => {
      vi.mocked(QuestSheet.findOne).mockRejectedValue(new Error('fail'));
      const { req, res } = mockReqRes({
        mst_quest_id: 200,
        clear_time: 45,
        session_id: 'sess-1',
      });
      await islandEnd(req, res);

      expect(encryptAndSend).toHaveBeenCalledWith(
        {},
        res,
        req,
        ERROR_CODE.GENERIC_ERROR,
        ERROR_CATEGORY.ERROR_DIALOG,
        'Island end failed',
      );
    });
  });

  describe('rewardExchange', () => {
    it('answers an empty exchange_list without a session, and never throws', async () => {
      const { req, res } = mockReqRes({ idx: 1 });
      await rewardExchange(req, res);
      expect(encryptAndSend).toHaveBeenCalledWith({ exchange_list: [] }, res, req);
    });

    it.runIf(PUNTI_PER_RISCATTO === 0)('does not pay points while QUEST_EXCHANGE_POINTS is unset', async () => {
      vi.mocked(User.findOne).mockResolvedValue({ uu_id: 'u1', box: { points: [] } } as never);
      const { req, res } = mockReqRes({ session_id: 'sess-1', idx: 1 });
      await rewardExchange(req, res);
      expect(encryptAndSend).toHaveBeenCalledWith({ exchange_list: [] }, res, req);
      expect(User.updateOne).not.toHaveBeenCalled();
    });

    it('returns NOT_AUTHENTICATED when the session is unknown', async () => {
      vi.mocked(User.findOne).mockResolvedValue(null);
      const { req, res } = mockReqRes({ session_id: 'bad', idx: 1 });
      await rewardExchange(req, res);
      expect(encryptAndSend).toHaveBeenCalledWith({}, res, req, ERROR_CODE.NOT_AUTHENTICATED);
    });
  });

  describe('islandMapAll', () => {
    it('returns NOT_AUTHENTICATED when user not found', async () => {
      vi.mocked(User.findOne).mockResolvedValue(null);
      const { req, res } = mockReqRes({ session_id: 'bad' });
      await islandMapAll(req, res);
      expect(encryptAndSend).toHaveBeenCalledWith({}, res, req, ERROR_CODE.NOT_AUTHENTICATED);
    });

    it('returns error on DB failure', async () => {
      vi.mocked(User.findOne).mockRejectedValue(new Error('fail'));
      const { req, res } = mockReqRes({ session_id: 'sess-1' });
      await islandMapAll(req, res);
      expect(encryptAndSend).toHaveBeenCalledWith(
        {},
        res,
        req,
        ERROR_CODE.GENERIC_ERROR,
        ERROR_CATEGORY.ERROR_DIALOG,
        'Island map all failed',
      );
    });
  });
});
