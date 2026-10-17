import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../model/user');

import User from '../model/user.js';
import { talismanAbilitato, talismanAbilitatoDaSessione } from './talismanService.js';

// 新米激励の火宝石 — a real charm id from src/json/omamori.json.
const MST_CHARM = 3529887655;

function doc(overrides: Record<string, unknown> = {}) {
  return {
    equipset: {
      selected_equip_set_index: 1,
      equip_sets: [{ index: 1, talisman: { equipment_id: 'NO_EQUIP' } }],
    },
    box: { equipments: [] as Record<string, unknown>[] },
    ...overrides,
  };
}

describe('talismanService', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('enables the charm when the selected set has an awake talisman', () => {
    const d = doc();
    d.box.equipments = [
      { equipment_id: 'OD_OMA1387', mst_equipment_id: MST_CHARM, is_awake: 1 },
    ];
    d.equipset.equip_sets = [{ index: 1, talisman: { equipment_id: 'OD_OMA1387' } }];
    expect(talismanAbilitato(d)).toBe(1);
  });

  it('ignores a talisman that is not awake', () => {
    const d = doc();
    d.box.equipments = [
      { equipment_id: 'OD_OMA1387', mst_equipment_id: MST_CHARM, is_awake: 0 },
    ];
    d.equipset.equip_sets = [{ index: 1, talisman: { equipment_id: 'OD_OMA1387' } }];
    expect(talismanAbilitato(d)).toBe(0);
  });

  it('falls back to any released charm when the set has not been saved', () => {
    // The client can equip a released charm locally before the equip set
    // round-trips; the server still owns the released charm.
    const d = doc();
    d.box.equipments = [
      { equipment_id: 'OD_OMA1387', mst_equipment_id: MST_CHARM, is_awake: 1 },
    ];
    expect(talismanAbilitato(d)).toBe(1);
  });

  it('is 0 when the player has no released charm', () => {
    const d = doc();
    d.box.equipments = [
      { equipment_id: 'OD_OMA1388', mst_equipment_id: 1121636918, is_awake: 0 },
      { equipment_id: 'WD_SWORD001', mst_equipment_id: 2006810019, is_awake: 1 },
    ];
    expect(talismanAbilitato(d)).toBe(0);
  });

  it('handles a missing box or equipset', () => {
    expect(talismanAbilitato({})).toBe(0);
  });

  it('looks the player up by session and never throws', async () => {
    vi.mocked(User.findOne).mockResolvedValue(null);
    expect(await talismanAbilitatoDaSessione('sess')).toBe(0);

    expect(await talismanAbilitatoDaSessione('')).toBe(0);
    expect(await talismanAbilitatoDaSessione(undefined)).toBe(0);

    vi.mocked(User.findOne).mockRejectedValue(new Error('db down'));
    expect(await talismanAbilitatoDaSessione('sess')).toBe(0);
  });
});
