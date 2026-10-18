# Equipment sets and partner (mercenary) sets

Server side of the hunter's 5 equipment sets (`equipset.equip_sets`) and of the
partner/mercenary gear inside them (`partner_equip_sets`). Endpoints:
`user/equipset/get` and `user/equipset/set` (`src/routes/api/user/equipset/`).

## What the client sends

`cAPIUserEquipSetSet::Request` (parsed from `libMHS.so`) has:

- `selected_equip_set_index` (int)
- `equip_sets`: array of set objects, each with `index`, `arm`, `body`, `head`,
  `leg`, `secret_weapon`, `talisman`, `waist`, `weapon`, `partner_equip_sets`.

`sPlayerWorkspace::setRequestUserEquipSet` copies **every set it currently
holds** into the request, so the array is normally all of them. A save can still
be partial (the client may send an empty `equip_sets` when only the active set
changed), so the server must not assume it always gets all 5.

## What the server does (`userEquipSet.controller.ts`)

- `get`: completes the stored sets up to `capacity_eqp_set` (missing or
  weapon-less indices are cloned from the selected set, partners included) so the
  menu shows 5 usable sets, and completes the mercenaries. **The completed sets are
  only the reply: they are never written back.** The only write is a default
  partner weapon that is really missing from the box.
- `set`: **merges** the received sets into the stored ones by `index` (partners by
  `mst_partner_id`), so a partial save keeps the other sets. `selected_equip_set_index`
  and `capacity_eqp_set` are always saved, even with no sets in the body.

`services/setMercenari.ts` guarantees each owned mercenary has a set with a valid
weapon in the box (default weapon from `rsdnt_property.arc :: partnerParam`,
`mDefaultWeaponID`). Why: `sPlayerWorkspace::getEquipWeapon(partner, set)` returns
null when the partner has no set or its weapon is not in the box, and
`uGUIMenuEquipMySet::updatePlayerStatus` dereferences it without checking, which
crashes the equip menu (`getEquipWeapon <- getEquipSet <- setupMyHunterDetail`).
`cloneDa` therefore copies the partner list too, or a set cloned without partners
would crash on set switch.

## Bugs this replaced (`RES_VER` not affected, server only)

- `get` used to pass its fabricated sets to `sistemaMercenari` as `setDaSalvare`,
  which wrote the clones to the database. Opening the equip menu overwrote the
  real sets and reset the partner gear: all 5 sets ended up identical to the
  selected one.
- `set` replaced the whole `equip_sets` array and only saved
  `selected_equip_set_index` when the body carried sets. A partial save dropped
  the other sets, and a pure active-set switch was forgotten (it reverted on
  re-entering the menu, with no "save equipment?" prompt because the client saw
  no change).

## Querying the live data

```
docker exec mhxr-serverheroic-self-mongo-1 mongosh -u root -p <DB_PASSWORD> \
  --authenticationDatabase admin apypos --quiet --eval \
  'db.users.findOne({_id:ObjectId("<id>")}).equipset' 
```

Look for: distinct `equip_sets` contents, `selected_equip_set_index`, and each
`partner_equip_sets[].weapon.equipment_id`. All sets being byte-identical, or
every partner on `NO_EQUIP` armor with the default weapon, is the old corruption.
