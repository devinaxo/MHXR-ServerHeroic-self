import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockEventSave } = vi.hoisted(() => ({
  mockEventSave: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../model/events/index', () => {
  function MockEvent() {
    // Constructor for new Event()
  }
  MockEvent.countDocuments = vi.fn();
  MockEvent.prototype.save = mockEventSave;

  // Funzione normale e non vi.fn(): resetAllMocks nel beforeEach azzererebbe
  // la risposta finta e renewEventDeadlines leggerebbe modifiedCount da undefined.
  const collection = () => ({ updateMany: async () => ({ modifiedCount: 0 }) });

  return {
    Event: MockEvent,
    AssualtEvents: {
      countDocuments: vi.fn(),
      create: vi.fn(),
      collection: collection(),
    },
    ScoreEvents: {
      countDocuments: vi.fn(),
      create: vi.fn(),
      collection: collection(),
    },
    TicketEvents: {
      countDocuments: vi.fn(),
      create: vi.fn(),
      collection: collection(),
    },
    TourEvents: { collection: collection() },
    StandingEvents: { collection: collection() },
    M16Events: { collection: collection() },
  };
});

vi.mock('../model/questSheet', () => ({
  default: {
    countDocuments: vi.fn(),
    insertMany: vi.fn(),
  },
}));

// Mock all JSON imports used by seedService
vi.mock('../json/questDB/normal.extended.complete.json', () => ({
  default: { rQuestSheet: { mQuestDataList: [{ id: 'normal1' }] } },
}));
vi.mock('../json/questDB/training.extended.complete.json', () => ({
  default: { rQuestSheet: { mQuestDataList: [{ id: 'training1' }] } },
}));
vi.mock('../json/questDB/score.extended.complete.json', () => ({
  default: { rQuestSheet: { mQuestDataList: [{ id: 'score1' }] } },
}));
vi.mock('../json/questDB/eternal.extended.complete.json', () => ({
  default: { rQuestSheet: { mQuestDataList: [{ id: 'eternal1' }] } },
}));
vi.mock('../json/questDB/ticket.extended.complete.json', () => ({
  default: { rQuestSheet: { mQuestDataList: [{ id: 'ticket1' }] } },
}));
vi.mock('../json/questDB/event.extended.blank.json', () => ({
  default: { rQuestSheet: { mQuestDataList: [{ id: 'event1' }] } },
}));
vi.mock('../json/ticket_events.json', () => ({ default: [{ mst_ticket_id: 1 }] }));
vi.mock('../json/coev_events.json', () => ({ default: [{ mst_coev_id: 1 }] }));
vi.mock('../json/easy_events.json', () => ({ default: [{ difficulty: 'easy' }] }));
vi.mock('../json/norm_events.json', () => ({ default: [{ difficulty: 'norm' }] }));
vi.mock('../json/hard_events.json', () => ({ default: [{ difficulty: 'hard' }] }));
vi.mock('../json/forb_events.json', () => ({ default: [{ difficulty: 'forb' }] }));

import { Event, AssualtEvents, ScoreEvents, TicketEvents } from '../model/events/index.js';
import QuestSheet from '../model/questSheet.js';
import { seedDatabase, normalizzaQuest } from './seedService.js';

const mockLog = {
  info: vi.fn(),
  error: vi.fn(),
};

describe('seedService', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('seedDatabase', () => {
    it('seeds all collections when database is empty', async () => {
      vi.mocked(Event.countDocuments).mockResolvedValue(0);
      vi.mocked(Event.prototype.save).mockResolvedValue(undefined);
      vi.mocked(AssualtEvents.countDocuments).mockResolvedValue(0);
      vi.mocked(AssualtEvents.create).mockResolvedValue({} as never);
      vi.mocked(ScoreEvents.countDocuments).mockResolvedValue(0);
      vi.mocked(ScoreEvents.create).mockResolvedValue({} as never);
      vi.mocked(TicketEvents.countDocuments).mockResolvedValue(0);
      vi.mocked(TicketEvents.create).mockResolvedValue({} as never);
      vi.mocked(QuestSheet.countDocuments).mockResolvedValue(0);
      vi.mocked(QuestSheet.insertMany).mockResolvedValue([] as never);

      await seedDatabase(mockLog);

      expect(Event.countDocuments).toHaveBeenCalledWith({});
      expect(AssualtEvents.countDocuments).toHaveBeenCalledWith({});
      expect(ScoreEvents.countDocuments).toHaveBeenCalledWith({});
      expect(TicketEvents.countDocuments).toHaveBeenCalledWith({});
      expect(QuestSheet.countDocuments).toHaveBeenCalledWith({});

      // Assault events: easy + norm + hard + forb = 4 events
      expect(AssualtEvents.create).toHaveBeenCalledTimes(4);
      // Score events: 1 coev event
      expect(ScoreEvents.create).toHaveBeenCalledTimes(1);
      // Ticket events: 1 ticket event
      expect(TicketEvents.create).toHaveBeenCalledTimes(1);
      // Quest sheets: normal, training, score, eternal, ticket and event are
      // combined into a single insertMany (so they can be normalised first).
      expect(QuestSheet.insertMany).toHaveBeenCalledTimes(1);
      expect(vi.mocked(QuestSheet.insertMany).mock.calls[0]![0]).toEqual([
        { id: 'normal1' },
        { id: 'training1' },
        { id: 'score1' },
        { id: 'eternal1' },
        { id: 'ticket1' },
        { id: 'event1' },
      ]);
    });

    it('skips seeding when collections are not empty', async () => {
      vi.mocked(Event.countDocuments).mockResolvedValue(5);
      vi.mocked(AssualtEvents.countDocuments).mockResolvedValue(10);
      vi.mocked(ScoreEvents.countDocuments).mockResolvedValue(3);
      vi.mocked(TicketEvents.countDocuments).mockResolvedValue(2);
      vi.mocked(QuestSheet.countDocuments).mockResolvedValue(100);

      await seedDatabase(mockLog);

      expect(mockEventSave).not.toHaveBeenCalled();
      expect(AssualtEvents.create).not.toHaveBeenCalled();
      expect(ScoreEvents.create).not.toHaveBeenCalled();
      expect(TicketEvents.create).not.toHaveBeenCalled();
      expect(QuestSheet.insertMany).not.toHaveBeenCalled();
    });

    it('seeds only empty collections when some already have data', async () => {
      vi.mocked(Event.countDocuments).mockResolvedValue(1); // skip
      vi.mocked(AssualtEvents.countDocuments).mockResolvedValue(0); // seed
      vi.mocked(AssualtEvents.create).mockResolvedValue({} as never);
      vi.mocked(ScoreEvents.countDocuments).mockResolvedValue(5); // skip
      vi.mocked(TicketEvents.countDocuments).mockResolvedValue(0); // seed
      vi.mocked(TicketEvents.create).mockResolvedValue({} as never);
      vi.mocked(QuestSheet.countDocuments).mockResolvedValue(50); // skip

      await seedDatabase(mockLog);

      expect(mockEventSave).not.toHaveBeenCalled();
      expect(AssualtEvents.create).toHaveBeenCalled();
      expect(ScoreEvents.create).not.toHaveBeenCalled();
      expect(TicketEvents.create).toHaveBeenCalled();
      expect(QuestSheet.insertMany).not.toHaveBeenCalled();
    });

    it('unwraps wrapped reward and boss arrays before insert', () => {
      // Le quest evento arrivano dal convertitore XFS con gli array avvolti:
      // senza srotolarli Mongoose scriverebbe [null] (era il bug che lasciava
      // le 1524 quest evento senza ricompense).
      const quest = {
        mQuestID: '123',
        mRewardItemList: { mAutoDelete: 'false', array: { mpArray: [{ mItemHash: '111' }] } },
        mBossList: { mAutoDelete: 'false', classref_: { mpArray: [{ mEnemyID: '3' }] } },
      };
      expect(normalizzaQuest(quest)).toEqual({
        mQuestID: '123',
        mRewardItemList: [{ mItemHash: '111' }],
        mBossList: [{ mEnemyID: '3' }],
      });
    });

    it('leaves already-flat arrays untouched', () => {
      const rewards = [{ mItemHash: '111' }];
      const quest = { mQuestID: '123', mRewardItemList: rewards };
      expect(normalizzaQuest(quest).mRewardItemList).toBe(rewards);
    });

    it('creates assault events with timestamp fields', async () => {
      vi.mocked(Event.countDocuments).mockResolvedValue(1);
      vi.mocked(AssualtEvents.countDocuments).mockResolvedValue(0);
      vi.mocked(AssualtEvents.create).mockResolvedValue({} as never);
      vi.mocked(ScoreEvents.countDocuments).mockResolvedValue(1);
      vi.mocked(TicketEvents.countDocuments).mockResolvedValue(1);
      vi.mocked(QuestSheet.countDocuments).mockResolvedValue(1);

      await seedDatabase(mockLog);

      expect(AssualtEvents.create).toHaveBeenCalledWith(
        expect.objectContaining({
          appear_remain: expect.any(Number),
          disappear_remain: expect.any(Number),
          end_remain: expect.any(Number),
          start_remain: expect.any(Number),
        }),
      );
    });

    it('creates score events with timestamp fields', async () => {
      vi.mocked(Event.countDocuments).mockResolvedValue(1);
      vi.mocked(AssualtEvents.countDocuments).mockResolvedValue(1);
      vi.mocked(ScoreEvents.countDocuments).mockResolvedValue(0);
      vi.mocked(ScoreEvents.create).mockResolvedValue({} as never);
      vi.mocked(TicketEvents.countDocuments).mockResolvedValue(1);
      vi.mocked(QuestSheet.countDocuments).mockResolvedValue(1);

      await seedDatabase(mockLog);

      expect(ScoreEvents.create).toHaveBeenCalledWith(
        expect.objectContaining({
          end_remain: expect.any(Number),
          start_remain: expect.any(Number),
        }),
      );
    });

    it('creates ticket events with timestamp fields', async () => {
      vi.mocked(Event.countDocuments).mockResolvedValue(1);
      vi.mocked(AssualtEvents.countDocuments).mockResolvedValue(1);
      vi.mocked(ScoreEvents.countDocuments).mockResolvedValue(1);
      vi.mocked(TicketEvents.countDocuments).mockResolvedValue(0);
      vi.mocked(TicketEvents.create).mockResolvedValue({} as never);
      vi.mocked(QuestSheet.countDocuments).mockResolvedValue(1);

      await seedDatabase(mockLog);

      expect(TicketEvents.create).toHaveBeenCalledWith(
        expect.objectContaining({
          buy_end_remain: expect.any(Number),
          buy_start_remain: expect.any(Number),
          clear_time: 0,
          end_remain: expect.any(Number),
          start_remain: expect.any(Number),
        }),
      );
    });

    it('logs info messages for each collection', async () => {
      vi.mocked(Event.countDocuments).mockResolvedValue(1);
      vi.mocked(AssualtEvents.countDocuments).mockResolvedValue(1);
      vi.mocked(ScoreEvents.countDocuments).mockResolvedValue(1);
      vi.mocked(TicketEvents.countDocuments).mockResolvedValue(1);
      vi.mocked(QuestSheet.countDocuments).mockResolvedValue(1);

      await seedDatabase(mockLog);

      // Should log count for each collection type
      expect(mockLog.info).toHaveBeenCalledWith(expect.stringContaining('Number of Events'));
      expect(mockLog.info).toHaveBeenCalledWith(
        expect.stringContaining('Number of Assualt Events'),
      );
      expect(mockLog.info).toHaveBeenCalledWith(
        expect.stringContaining('Number of Score Events'),
      );
      expect(mockLog.info).toHaveBeenCalledWith(
        expect.stringContaining('Number of Ticket Events'),
      );
      expect(mockLog.info).toHaveBeenCalledWith(expect.stringContaining('Number of Quests'));
    });
  });
});
