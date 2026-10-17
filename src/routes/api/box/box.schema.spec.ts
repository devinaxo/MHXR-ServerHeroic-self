import { describe, it, expect } from 'vitest';
import {
  BoxGetSchema,
  StorageGetSchema,
  EquipLevelupSchema,
  EquipAwakeSchema,
  EquipWSkillupSchema,
  PotentialupAutoSetSchema,
  SaleSchema,
  FavoriteSetSchema,
  MonumentLevelupSchema,
} from './box.schema.js';

describe('box.schema', () => {
  it('BoxGetSchema validates', () => {
    expect(BoxGetSchema.safeParse({ session_id: 'sid' }).success).toBe(true);
  });

  it('StorageGetSchema validates', () => {
    expect(StorageGetSchema.safeParse({ target_idx: 1 }).success).toBe(true);
  });

  it('EquipLevelupSchema validates', () => {
    expect(EquipLevelupSchema.safeParse({ session_id: 'sid', eqp_obj_id: 'eq1' }).success).toBe(true);
  });

  it('EquipAwakeSchema validates', () => {
    expect(EquipAwakeSchema.safeParse({ session_id: 'sid', base_equipment_id: 'eq1' }).success).toBe(true);
  });

  it('EquipWSkillupSchema validates', () => {
    const ok = EquipWSkillupSchema.safeParse({
      session_id: 'sid',
      base_equipment_id: 'eq1',
      is_use_reinforcement: 0,
      num: 1,
    });
    expect(ok.success).toBe(true);
    // base_equipment_id is required, unlike num (defaults to 1 in the controller).
    expect(EquipWSkillupSchema.safeParse({ session_id: 'sid' }).success).toBe(false);
  });

  it('PotentialupAutoSetSchema validates', () => {
    expect(PotentialupAutoSetSchema.safeParse({ eqp_obj_infos: [] }).success).toBe(true);
  });

  it('SaleSchema validates', () => {
    expect(SaleSchema.safeParse({ eqp_obj_ids: ['eq1'] }).success).toBe(true);
  });

  it('FavoriteSetSchema validates', () => {
    expect(FavoriteSetSchema.safeParse({ is_favorite: 1, eqp_obj_id: 'eq1' }).success).toBe(true);
  });

  it('MonumentLevelupSchema validates', () => {
    expect(MonumentLevelupSchema.safeParse({ session_id: 'sid', type: 'atk' }).success).toBe(true);
  });
});
