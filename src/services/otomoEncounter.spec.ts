import { describe, it, expect } from 'vitest';
import {
  chanceIncontroOtomo,
  creaOtomoIncontro,
  estraiOtomoIncontro,
  otomoIdDaCharNo,
  otomoNonPosseduti,
  otomoOttenibile,
  OTOMO_INCONTRO_CHANCE_PREDEFINITA,
  type OtomoMaster,
} from './otomoEncounter.js';

const CACAO_ID = 498951865; // カカオ, charNo 118
const SOUFFLE_ID = 1790596655; // スフレ, charNo 119

describe('otomoEncounter', () => {
  it('builds the box otomo_id from the master char number', () => {
    expect(otomoIdDaCharNo(118)).toBe('OT_OTOMO_CHAR_ID_118');
    expect(otomoIdDaCharNo(1)).toBe('OT_OTOMO_CHAR_ID_001');
    expect(otomoIdDaCharNo(0)).toBe('OT_OTOMO_CHAR_ID_000');
  });

  it('keeps only real, non-event palicos in the pool', () => {
    for (const o of otomoNonPosseduti([])) {
      expect(otomoOttenibile(o)).toBe(true);
      expect(o.charNo).toBeGreaterThan(0);
      expect(o.charNo).toBeLessThan(200);
      expect(o.event).toBe(0);
    }
  });

  it('never proposes a palico the player already owns', () => {
    const pool = otomoNonPosseduti([
      { mst_otomo_id: CACAO_ID, otomo_id: 'OT_OTOMO_CHAR_ID_118' },
      { mst_otomo_id: SOUFFLE_ID, otomo_id: 'OT_OTOMO_CHAR_ID_119' },
    ]);
    expect(pool.some((o) => o.id === CACAO_ID)).toBe(false);
    expect(pool.some((o) => o.id === SOUFFLE_ID)).toBe(false);
  });

  it('honours the chance knob: 0 never drops, 100 always picks', () => {
    expect(estraiOtomoIncontro([], () => 0, 0)).toBeNull();
    expect(estraiOtomoIncontro([], () => 0.999, 100)).not.toBeNull();
  });

  it('stops dropping once the whole obtainable pool is owned', () => {
    const tutti = otomoNonPosseduti([]).map((o) => ({ mst_otomo_id: o.id, otomo_id: otomoIdDaCharNo(o.charNo) }));
    expect(estraiOtomoIncontro(tutti, () => 0, 100)).toBeNull();
  });

  it('reads the default chance from the environment', () => {
    const prev = process.env.OTOMO_ENCOUNTER_CHANCE;
    try {
      delete process.env.OTOMO_ENCOUNTER_CHANCE;
      expect(chanceIncontroOtomo()).toBe(OTOMO_INCONTRO_CHANCE_PREDEFINITA);
      process.env.OTOMO_ENCOUNTER_CHANCE = '   ';
      expect(chanceIncontroOtomo()).toBe(OTOMO_INCONTRO_CHANCE_PREDEFINITA);
      process.env.OTOMO_ENCOUNTER_CHANCE = '0';
      expect(chanceIncontroOtomo()).toBe(0);
      process.env.OTOMO_ENCOUNTER_CHANCE = '150';
      expect(chanceIncontroOtomo()).toBe(100);
    } finally {
      if (prev === undefined) delete process.env.OTOMO_ENCOUNTER_CHANCE;
      else process.env.OTOMO_ENCOUNTER_CHANCE = prev;
    }
  });

  it('creates a level 1 box row the client accepts', () => {
    const candidato: OtomoMaster = {
      charNo: 42, id: 123456, name: 'テスト', type: 1, maxLevel: 60,
      rarity: 3, event: 0, release: 1, initialSubskills: [1355115484], mainSkills: [1, 2],
    };
    const nuovo = creaOtomoIncontro(candidato, 1_700_000_000_000);
    expect(nuovo).toEqual({
      created: 1_700_000_000,
      exp: 0,
      mst_otomo_id: 123456,
      otomo_id: 'OT_OTOMO_CHAR_ID_042',
      subskill: [1355115484],
      attack: 1,
      defense: 1,
      hp: 1,
      level: 1,
    });
  });
});
