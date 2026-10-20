# Event shop (Hunt Fest Flag P)

The event shop is the in-game exchange the client opens from an event on the
event home. This fork wires it to **Hunter Fest Flag P** (`狩猟祭フラッグＰ`,
event point id `3994654250`, `EVENTPOINT7001001`).

Before this, the reward screen at the end of every island quest showed
`Hunt Fest Flag P x5` but the server never credited it, so it was dead. Now it is
a real balance in `box.points`, spendable at the event shop.

## Client protocol

Read out of `libMHS.so`:

| Endpoint | Request | Response |
| --- | --- | --- |
| `POST /api/event/shop/list` | `{ session_id, mst_event_info_id }` | `{ event_shop_items[] }` |
| `POST /api/event/shop/buy` | `{ session_id, amount, mst_event_info_id, mst_shop_item_id }` | `{ item_contents, point }` |

A row of `event_shop_items` has the same shape the Trading Post already uses
(`detail`, `name`, `price`, `mst_shop_item_id`, `item_limit`, `item_limit_max`,
`shop_limit`, `shop_limit_max`, `item_contents`, `disp_item_contents`,
`filter_type`, `start_remain`, `end_remain`). The `point` in the buy response is
what refreshes the client's cached balance.

Note the list request carries `mst_event_info_id`, not `mst_event_shop_id`: the
client takes it from the event entry and sends it back.

## Earning the flag

`questIsland.controller.ts` credits `PUNTI_EVENTO_ISOLA` (default 5) Hunt Fest
Flag P at the end of every island clear, the same 5 the reward screen shows. The
"all rewards x5" (`quest/reward/final`, paid in 狩玉) adds the remaining 4x, so
the total matches what the screen shows. Disable the payout with
`QUEST_EVENT_FLAGS=0`.

## The event entry

`event.controller.ts` adds a Hunter Fest entry to `/api/event/info/get`, so the
event home shows the event and its shop button. The entry is built from the
template left by upstream plus the Hunter Fest data we do have:

- `mst_event_point_id` = `3994654250`
- `target_event_node_infos` = the four 狩猟祭 nodes (`seev_events.json`)
- `mst_event_info_id` = `628862266` (override `HUNT_FEST_EVENT_INFO_ID`)

This part is **experimental**: the event home is rendered from client data we do
not have in the repo (`eventHome.xml` and friends), so the button may need a
client-pack entry keyed by the same `mst_event_info_id` before it appears. The
shop endpoints themselves do not need the event home, so they still answer if
another event is active. Turn the event entry off with `HUNT_FEST_EVENT=0`.

## Tuning

`SCAFFALE_EVENTO` in `event.controller.ts` is the shelf: a list of
`{ id, prezzo }`, prices in flags. Ids must come from `src/json/materiali.json`;
an unknown id written into the box blocks login (the August lesson). The daily
per-player cap and total stock are the shared `PER_GIOCOATORE` /
`SCORTA_TOTALE` (`TRADE_SHOP_PER_PLAYER`, `TRADE_SHOP_STOCK`).

## Environment

| Variable | Default | Meaning |
| --- | --- | --- |
| `QUEST_EVENT_FLAGS` | `5` | Flags paid per island clear (`0` disables) |
| `HUNT_FEST_EVENT` | `1` | Add the Hunter Fest entry to `/event/info/get` (`0` disables) |
| `HUNT_FEST_EVENT_INFO_ID` | `628862266` | Event id, must match the client event |
