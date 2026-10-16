import { describe, it, expect } from 'vitest';
import {
  dimenticaSubSkillOtomo,
  otomoIdsDaRichiesta,
  otomoIdsSquadraSelezionata,
  premiaOtomoFineQuest,
  registraOtomoAvviati,
  OTOMO_NO_SKILL,
} from './otomoQuest.js';
import { OTOMO_SKILL_POOL } from './otomoGrow.js';

const CACAO = 498951865;

describe('otomoQuest', () => {
  it('collects the otomo_id list from a quest start request', () => {
    // The client sends a bare array of otomo_id strings...
    expect(otomoIdsDaRichiesta(['OT_A', 'OT_B', 'OT_A'])).toEqual(['OT_A', 'OT_B']);
    // ...but tolerate the object form too.
    expect(otomoIdsDaRichiesta([{ otomo_id: 'A' }, { otomo_id: 'B' }, { otomo_id: 'A' }])).toEqual(['A', 'B']);
    expect(otomoIdsDaRichiesta(undefined)).toEqual([]);
    expect(otomoIdsDaRichiesta([{ nope: 1 }, 5])).toEqual([]);
  });

  it('remembers which palicos set off', () => {
    expect(registraOtomoAvviati(42, ['OT_A'])).toEqual({ mst_quest_id: 42, otomo_ids: ['OT_A'] });
  });

  it('falls back to the selected otomo team', () => {
    const team = {
      selected_index: 2,
      otomo_team: [
        { index: 1, otomo_ids: ['OT_OLD'] },
        { index: 2, otomo_ids: ['OT_118', 'OT_119'] },
      ],
    };
    expect(otomoIdsSquadraSelezionata(team)).toEqual(['OT_118', 'OT_119']);
    // No selected match: first team.
    expect(otomoIdsSquadraSelezionata({ selected_index: 9, otomo_team: team.otomo_team })).toEqual(['OT_OLD']);
    expect(otomoIdsSquadraSelezionata(undefined)).toEqual([]);
  });

  it('grants quest exp to the participating palico and reports it back', () => {
    const otomos = [{ otomo_id: 'OT_CACAO', mst_otomo_id: CACAO, exp: 700, subskill: [] as number[] }];
    const premi = premiaOtomoFineQuest(otomos, ['OT_CACAO']);

    expect(premi).toHaveLength(1);
    expect(premi[0]!.otomo_id).toBe('OT_CACAO');
    expect(premi[0]!.get_exp).toBeGreaterThan(0);
    expect(otomos[0]!.exp).toBe(700 + premi[0]!.get_exp);
  });

  it('leaves palicos that did not go alone', () => {
    const otomos = [{ otomo_id: 'OT_A', mst_otomo_id: CACAO, exp: 0, subskill: [] as number[] }];
    expect(premiaOtomoFineQuest(otomos, ['OT_B'])).toEqual([]);
    expect(otomos[0]!.exp).toBe(0);
  });

  it('teaches a subskill when a level-up opens a slot', () => {
    // 61156 is the cumulative exp for level 10 (see otomo-grow.json), and the
    // first subskill slot opens exactly there. Park the palico one point below
    // and let the quest push it over.
    const soglia = 61156;
    const otomos = [{ otomo_id: 'OT_CACAO', mst_otomo_id: CACAO, exp: soglia - 1, subskill: [] as number[] }];
    const premi = premiaOtomoFineQuest(otomos, ['OT_CACAO']);

    expect(otomos[0]!.exp).toBe(soglia - 1 + premi[0]!.get_exp);
    expect(premi[0]!.mst_otomo_subskill_id).not.toBe(0);
    expect(OTOMO_SKILL_POOL).toContain(premi[0]!.mst_otomo_subskill_id);
    expect(otomos[0]!.subskill).toContain(premi[0]!.mst_otomo_subskill_id);
  });

  it('removes a forgotten subskill instead of leaving No Skill behind', () => {
    const otomo = { subskill: [OTOMO_NO_SKILL, 1355115484, 2587550611] };
    expect(dimenticaSubSkillOtomo(otomo, 1355115484)).toBe(true);
    expect(otomo.subskill).toEqual([2587550611]);
    // Forgetting a skill it does not have changes nothing.
    expect(dimenticaSubSkillOtomo(otomo, 999)).toBe(false);
  });
});
