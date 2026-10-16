// Error codes from EAPI_jpn.gmd in GUI_msg.arc
export const ERROR_CODE = {
  SUCCESS: 0,
  GENERIC_ERROR: 1,
  NOT_FOUND: 100,
  EQUIPMENT_NOT_FOUND: 2001,
  NOT_AUTHENTICATED: 2004,
  LOGIN_FAILED: 4004,
  // Quest error codes (from quest.controller.ts)
  QUEST_ERROR: 10000,
  QUEST_INFO_FAILED: 10001,
  QUEST_INFO_FAILED_2: 10002,
  QUEST_INFO_FAILED_3: 10003,
  QUEST_OUT_OF_SESSION: 10004,
  QUEST_INFO_FAILED_5: 10005,
  QUEST_ALREADY_IN_PROGRESS: 10006,
  QUEST_NOT_UNLOCKED: 10007,
  INVALID_REQUEST: 400,
  // 狩友 ("Hunting Friend"): indici 59-68 di EAPI_jpn.gmd, verificati sul
  // testo vero del blocco (vedi lavoro-traduzione/trad/EAPI.json) — non
  // inventati, sono gli stessi indici che il client usa per scegliere il
  // messaggio da mostrare.
  FRIEND_ALREADY_FRIENDS: 59,
  FRIEND_REQUEST_DISCARDED_ALREADY_FRIENDS: 60,
  FRIEND_NOT_FOUND: 61,
  FRIEND_CANNOT_REQUEST_SELF: 62,
  FRIEND_CANNOT_REMOVE_SELF: 63,
  FRIEND_TARGET_INBOX_FULL: 64,
  FRIEND_REQUEST_ALREADY_SENT: 65,
  FRIEND_OWN_SLOTS_FULL: 66,
  FRIEND_TARGET_SLOTS_FULL: 67,
  FRIEND_REQUEST_GONE: 68,
  // The rest come from EAPI_jpn.gmd, the client's error message table. The
  // client picks the dialog from this index, so returning the right one is the
  // difference between a useful message and the generic "No API Error" that
  // GENERIC_ERROR produces. Indices verified against the real text block, see
  // lavoro-traduzione/trad/EAPI.json.
  PRESENT_BOX_FULL: 40, // would exceed your max, so it could not be received
  QUEST_OUT_OF_TIME: 47, // outside the quest's availability window
  EQUIP_BOX_FULL: 52, // "Your Equipment Box is full / please sell some"
  QUEST_TICKETS_NOT_ENOUGH: 54,
  ITEMS_NOT_ENOUGH: 55,
  PAID_ITEM_INFO_FAILED: 72,
  KARIDAMA_NOT_ENOUGH: 73, // "Not enough Hunting Orbs" -- the gems
  EQUIP_INFO_FAILED: 75,
  EQUIP_MAX_LEVEL: 78,
  EQUIP_UPGRADE_FAILED: 79,
  ZENY_NOT_ENOUGH: 80,
  MATERIALS_NOT_ENOUGH: 81,
  MATERIAL_NOT_IN_BOX: 82,
  EQUIP_NOT_IN_BOX: 83,
  EQUIP_IS_EQUIPPED: 88, // cannot sell what you are wearing
  OTOMO_SUB_SKILL_LIMIT: 91,
  MATERIAL_NOT_IN_BOX_SELL: 94,
  MATERIALS_NOT_ENOUGH_SELL: 95,
  MATERIAL_SALE_FAILED: 96,
  CONSUMABLES_NOT_ENOUGH: 100,
  ACHIEVEMENT_REWARD_FAILED: 102,
  GLOWSTONES_NOT_ENOUGH: 107,
} as const;

export const ERROR_CATEGORY = {
  NONE: 0,
  AUTO_RETRY: 1,
  ERROR_DIALOG: 2,
  RETRY_PROMPT: 3,
} as const;
