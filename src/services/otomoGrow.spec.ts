import { describe, it, expect } from 'vitest';
import {
  applicaExpOtomo,
  expAlLivelloOtomo,
  livelloPerExpOtomo,
  maxLivelloOtomo,
  skillDaImparareOtomo,
  slotSubSkillOtomo,
  subSkillValideOtomo,
  tabellaOtomo,
  OTOMO_NO_SKILL,
  OTOMO_SKILL_POOL,
} from './otomoGrow.js';

// Real otomos out of rsdnt_otomo.arc (カカオ max 80, ワッフル max 40).
const CACAO = 498951865;
const WAFFLE = 2092467563;

describe('otomoGrow', () => {
  it('reads the real per-otomo table', () => {
    expect(tabellaOtomo(CACAO)?.maxLevel).toBe(80);
    expect(tabellaOtomo(WAFFLE)?.maxLevel).toBe(40);
    expect(maxLivelloOtomo(CACAO)).toBe(80);
    expect(tabellaOtomo(123)).toBeUndefined();
  });

  it('derives the level from cumulative exp', () => {
    // カカオ needs 755 exp for level 2 (real table value).
    expect(livelloPerExpOtomo(0, CACAO)).toBe(1);
    expect(livelloPerExpOtomo(754, CACAO)).toBe(1);
    expect(livelloPerExpOtomo(755, CACAO)).toBe(2);
    expect(expAlLivelloOtomo(2, CACAO)).toBe(755);
    // Unknown otomo stays at level 1 instead of throwing.
    expect(livelloPerExpOtomo(999999, 0)).toBe(1);
  });

  it('caps at the otomo max level', () => {
    expect(livelloPerExpOtomo(Number.MAX_SAFE_INTEGER, CACAO)).toBe(80);
    expect(livelloPerExpOtomo(Number.MAX_SAFE_INTEGER, WAFFLE)).toBe(40);
  });

  it('opens a subskill slot at 10 / 25 / 75 only', () => {
    expect([9, 10, 24, 25, 74, 75, 99].map(slotSubSkillOtomo)).toEqual([0, 1, 1, 2, 2, 3, 3]);
  });

  it('adds exp and clamps at the table ceiling', () => {
    const esito = applicaExpOtomo({ mst_otomo_id: CACAO, exp: 700 }, 100);
    expect(esito.level).toBe(2);
    expect(esito.exp).toBe(800);
    expect(esito.salito).toBe(true);

    const max = tabellaOtomo(CACAO)!.expByLevel[79]!;
    const capped = applicaExpOtomo({ mst_otomo_id: CACAO, exp: max - 10 }, 1_000_000);
    expect(capped.exp).toBe(max);
    expect(capped.level).toBe(80);
  });

  it('teaches a real, unseen subskill and never the No Skill placeholder', () => {
    const s = skillDaImparareOtomo(CACAO, 10, []);
    expect(s).not.toBeNull();
    expect(OTOMO_SKILL_POOL).toContain(s);
    expect(s).not.toBe(OTOMO_NO_SKILL);

    // Level 10 opens exactly one slot: nothing more is due once it is filled...
    expect(skillDaImparareOtomo(CACAO, 10, [s!])).toBeNull();
    // ...but level 25 opens a second one.
    expect(skillDaImparareOtomo(CACAO, 25, [s!])).not.toBeNull();
  });

  it('drops the No Skill placeholder from a palico list', () => {
    expect(subSkillValideOtomo([OTOMO_NO_SKILL, 1355115484, 0])).toEqual([1355115484]);
  });
});
