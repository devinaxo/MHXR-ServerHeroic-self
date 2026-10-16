import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response } from 'express';

vi.mock('../../../model/user');
vi.mock('../../../model/questSheet');
vi.mock('../../../services/crypto/encryptionHelpers');
vi.mock('../../../middleware/logger', () => ({
  createLogger: () => ({ info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() }),
}));

import QuestSheet from '../../../model/questSheet.js';
import { encryptAndSend } from '../../../services/crypto/encryptionHelpers.js';
import { contentGet } from './questKatamari.controller.js';

function mockReqRes(body: Record<string, unknown> = {}) {
  const req = { body, ip: '127.0.0.1', get: vi.fn() } as unknown as Request;
  const res = {} as Response;
  return { req, res };
}

// Real ids: equipment rarity 1 and 8, and a material (src/json/equipaggiamenti.json,
// src/json/catalogo-ricompense.json).
const EQUIP_COMMON = 794677787; // rarity 1
const EQUIP_RARE = 4257592522; // rarity 8
const MATERIAL = 1926212767;

const idsOf = () => {
  const [data] = vi.mocked(encryptAndSend).mock.calls[0]!;
  return (data as { katamari_content_list: { mst_equipment_id: number }[] }).katamari_content_list.map(
    (e) => e.mst_equipment_id,
  );
};

describe('questKatamari.contentGet', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns the quest's REAL equipment rewards, rarest first, and no materials", async () => {
    vi.mocked(QuestSheet.findOne).mockResolvedValue({
      mRewardItemList: [
        { mItemHash: String(MATERIAL), mProbScale: '9', mRewardType: '0' },
        { mItemHash: String(EQUIP_COMMON), mProbScale: '1', mRewardType: '2' },
        { mItemHash: String(EQUIP_RARE), mProbScale: '1', mRewardType: '2' },
      ],
    } as never);

    const { req, res } = mockReqRes({ session_id: 's1', mst_quest_id: 123, mst_part_id: 456 });
    await contentGet(req, res);

    expect(idsOf()).toEqual([EQUIP_RARE, EQUIP_COMMON]);
    expect(encryptAndSend).toHaveBeenCalledTimes(1);
  });

  it('returns an EMPTY list when the quest rewards no equipment (client shows "cannot be obtained")', async () => {
    vi.mocked(QuestSheet.findOne).mockResolvedValue({
      mRewardItemList: [{ mItemHash: String(MATERIAL), mProbScale: '1', mRewardType: '0' }],
    } as never);

    const { req, res } = mockReqRes({ session_id: 's1', mst_quest_id: 999, mst_part_id: 111 });
    await contentGet(req, res);

    expect(idsOf()).toEqual([]);
  });

  it('does not invent equipment when the quest is unknown', async () => {
    vi.mocked(QuestSheet.findOne).mockResolvedValue(null as never);
    const { req, res } = mockReqRes({ session_id: 's1', mst_quest_id: 1 });
    await contentGet(req, res);
    expect(idsOf()).toEqual([]);
  });
});
