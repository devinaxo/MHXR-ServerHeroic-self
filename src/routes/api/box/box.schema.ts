import { z } from 'zod';
import { sessionIdSchema, commonRequestFields } from '../../../schemas/common.schema.js';

export const BoxGetSchema = z
  .object({
    session_id: sessionIdSchema,
    ...commonRequestFields,
  })
  .strict();

export type BoxGetInput = z.infer<typeof BoxGetSchema>;

export const StorageGetSchema = z
  .object({
    target_idx: z.number().int(),
    ...commonRequestFields,
  })
  .loose();

export type StorageGetInput = z.infer<typeof StorageGetSchema>;

/**
 * Equipment level-up (box/equipment/levelup, cAPIBoxEquipmentLevelup).
 * Request fields confirmed in libMHS.so (Request::createProperty):
 *   eqp_obj_id, num, is_use_reinforcement
 *
 * is_use_reinforcement picks how the materials are paid for:
 *   0 = the piece's own required materials
 *   1 = blend: spend what is owned and cover the shortfall with 強化材
 *   2 = 強化材 only
 */
export const EquipLevelupSchema = z
  .object({
    session_id: sessionIdSchema,
    eqp_obj_id: z.string(),
    num: z.number().int().optional(),
    is_use_reinforcement: z.number().int().optional(),
    ...commonRequestFields,
  })
  .loose();

export type EquipLevelupInput = z.infer<typeof EquipLevelupSchema>;

export const EquipAwakeSchema = z
  .object({
    session_id: sessionIdSchema,
    base_equipment_id: z.string(),
    ...commonRequestFields,
  })
  .loose();

export type EquipAwakeInput = z.infer<typeof EquipAwakeSchema>;

/**
 * Arts Lv. upgrade (武技強化, client cAPIBoxEquipmentWSkillup).
 * Request fields confirmed in libMHS.so (Request::createProperty):
 *   base_equipment_id, is_use_reinforcement, num
 */
export const EquipWSkillupSchema = z
  .object({
    session_id: sessionIdSchema,
    base_equipment_id: z.string(),
    is_use_reinforcement: z.number().int().optional(),
    num: z.number().int().optional(),
    ...commonRequestFields,
  })
  .loose();

export type EquipWSkillupInput = z.infer<typeof EquipWSkillupSchema>;

/**
 * Equipment evolution (box/equipment/evolve, cAPIBoxEquipmentEvolve).
 * Request fields confirmed in libMHS.so (Request::createProperty):
 *   base_equipment_id, evolved_mst_equipment_id, resource_equipment_ids
 *
 * resource_equipment_ids are instances sacrificed when the evolve table asks
 * for equipment (some evolutions need one copy of a sibling piece at a minimum
 * plus value). Materials are NOT listed by the client: the server takes them
 * from the evolve table.
 */
export const EquipEvolveSchema = z
  .object({
    session_id: sessionIdSchema,
    base_equipment_id: z.string(),
    evolved_mst_equipment_id: z.number().int().optional(),
    resource_equipment_ids: z.array(z.string()).default([]),
    ...commonRequestFields,
  })
  .loose();

export type EquipEvolveInput = z.infer<typeof EquipEvolveSchema>;

export const PotentialupAutoSetSchema = z
  .object({
    eqp_obj_infos: z.array(z.unknown()),
    ...commonRequestFields,
  })
  .loose();

export type PotentialupAutoSetInput = z.infer<typeof PotentialupAutoSetSchema>;

/**
 * Plus value with materials (box/equipment/potentialupmaterial,
 * cAPIBoxEquipmentPotentialupMaterial). Request fields from libMHS.so:
 *   base_equipment_id, resource_materials: [{ mst_material_id, amount }]
 */
export const PotentialupMaterialSchema = z
  .object({
    session_id: sessionIdSchema,
    base_equipment_id: z.string(),
    resource_materials: z
      .array(z.object({ mst_material_id: z.number().int(), amount: z.number().int() }))
      .default([]),
    ...commonRequestFields,
  })
  .loose();

export type PotentialupMaterialInput = z.infer<typeof PotentialupMaterialSchema>;

/**
 * Plus value with fodder equipment (box/equipment/potentialup,
 * cAPIBoxEquipmentPotentialup). Request fields from libMHS.so:
 *   base_equipment_id, resource_equipment_ids: [instance id]
 */
export const PotentialupSchema = z
  .object({
    session_id: sessionIdSchema,
    base_equipment_id: z.string(),
    resource_equipment_ids: z.array(z.string()).default([]),
    ...commonRequestFields,
  })
  .loose();

export type PotentialupInput = z.infer<typeof PotentialupSchema>;

export const SaleSchema = z
  .object({
    eqp_obj_ids: z.array(z.string()),
    ...commonRequestFields,
  })
  .loose();

export type SaleInput = z.infer<typeof SaleSchema>;

export const FavoriteSetSchema = z
  .object({
    is_favorite: z.number().int(),
    eqp_obj_id: z.string(),
    ...commonRequestFields,
  })
  .loose();

export type FavoriteSetInput = z.infer<typeof FavoriteSetSchema>;

export const MonumentLevelupSchema = z
  .object({
    session_id: sessionIdSchema,
    type: z.string(),
    ...commonRequestFields,
  })
  .loose();

export type MonumentLevelupInput = z.infer<typeof MonumentLevelupSchema>;
