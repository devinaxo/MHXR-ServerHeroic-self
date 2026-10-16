import { Request, Response } from 'express';
import { encryptAndSend } from '../../../services/crypto/encryptionHelpers.js';
import { ERROR_CODE, ERROR_CATEGORY } from '../../../constants/error.codes.js';
import { createLogger } from '../../../middleware/logger.js';
import User from '../../../model/user.js';
import Present from '../../../model/presents.js';
import { conteggiNavigazione } from '../../../services/navigazioneService.js';
import type { SessionOnlyInput } from './notice.schema.js';
const log = createLogger('notice');

/*
 * EXTRA TREASURE BUN (マシマシ宝まん). Read out of `sResponse::setupNoticeGet`
 * (libMHS.so): the notice response's `increase_info` is copied straight into
 * the client's cGameUserInfo --
 *
 *   mFreeRewardExtensionCount (+0x60) <- increase_info.now_num
 *   daily allowance            (+0x64) <- increase_info.max_num
 *   reset delay                (+0x68) <- increase_info.remain_time
 *   absolute deadline          (+0x6c) <- now + increase_info.remain_time
 *
 * and `uGUIMapQuestPowerUp::updateRewardExtensionButton` only offers the bun
 * when the allowance still has a use left (max_num - now_num >= 1). With the
 * old all-zero `increase_info` the option stayed greyed out on every quest.
 * These are the base daily numbers; MenuCmn 1092/1106/1107 describe the feature.
 */
const FREE_BUNS = {
  // `now_num` is whatever is not free any more; `max_num` must be the larger.
  now: Number(process.env.POWERUP_FREE_BUNS_USED ?? 1) || 0,
  max: Number(process.env.POWERUP_FREE_BUNS_MAX ?? 2) || 2,
  remain: Number(process.env.POWERUP_FREE_BUNS_REMAIN ?? 86400) || 0,
};

export const get = async (req: Request, res: Response) => {
  try {
    const { session_id } = req.body as SessionOnlyInput;
    const userDoc = await User.findOne({ current_session: session_id });
    if (!userDoc) {
      return encryptAndSend({}, res, req, ERROR_CODE.NOT_AUTHENTICATED); //Not authenticated
    }

    const presentCount = await Present.countDocuments({
      uu_id: userDoc.uu_id,
      received: { $ne: 1 },
    });

    log.debug('Count of unreceived presents:', presentCount); // Incomplete
    /*
     * Campaigns drive the banners the client floats above the island map and in
     * the quest list. Each entry needs a real target and a real countdown:
     * `message` is shown to the player verbatim, `end_remain` is seconds until
     * the banner goes away, and `value` is the quest count the campaign tracks.
     *
     * The three lists below used to carry the original author's debug stubs:
     * "Notice/Get island_campaign", "Notice/Get event_campaign_list" and "test",
     * all with a fixed 10-hour timer and made-up ids. The client showed them
     * as-is, so a banner reading "Notice/Get island_campaign 9 hours left"
     * followed the player around the map and reappeared on every quest.
     *
     * They are empty until there is a campaign behind them. There is nothing to
     * derive one from yet -- the `events` collection is empty and no event
     * scheduler runs -- so a plausible-looking row would just be a different
     * lie in the same place. The shape is kept because the client parses the
     * keys regardless of whether the arrays have anything in them.
     */
    const data = {
    banner_list: {
      outer_banner_list: [
        //Unknown Beahviour
        // {
        //   area_id: 2,
        //   outer_banner_id: "coev_04480",
        //   url: "",
        // },
      ],
      resident_banner_list: [
        //Unknown Beahviour
        // {
        //   resident_banner_id: 8090,
        //   url: "",
        // },
      ],
    },
    campaign_list: {
      // Shows a crown over the selected event. Needs a live event node.
      event_campaign_list: [],
      // Unknown behaviour, probably shaped like the event list.
      forest_campaign_list: [],
      // Banner above an island. Needs a real mst_part_id from the ocean data:
      // the stub used 3815380063, which is not one of the 36 islands.
      island_campaign_list: [],
      m16_campaign_list: [
        // {
        //   m16_campaigns: [
        //     {
        //       end_remain: 36000,
        //       message: "test",
        //       mst_m16_campaign_type_id: 1,
        //       normal_max: 1,
        //       normal_remain: 36000,
        //       special_max: 1,
        //       special_remain: 36000,
        //       start_remain: 3600,
        //       value: 1,
        //     },
        //   ],
        //   mst_event_info_id: 1,
        // },
      ],
      point_campaign_list: [
        // {
        //   mst_event_info_id:1,
        //   point_campaigns:[{
        //     end_remain: 36000,
        //     message: "test",
        //     mst_point_campaign_type_id:1,
        //     start_remain:3600,
        //     value:1
        //   }]
        // }
      ],
      purchase_campaign_list: [
        //Changes purchase to blue icon!
        // {
        //   end_remain:36000,
        //   start_remain:0
        // }
      ],
      score_campaign_list: [
        // {
        //   mst_event_info_id:1,
        //   score_campaigns:[{
        //     end_remain: 36000,
        //     message: "test",
        //     mst_score_campaign_type_id:1,
        //     start_remain:3600,
        //     value:1
        //   }]
        // }
      ],
      strengthen_campaign_list: [
        //   {
        //   end:3600,
        //   message:"strengthen",
        //   mst_strengthen_campaign_type_id:1,
        //   start_remain:0,
        //   value:1
        // }
      ],
    },
    emergency_info_list: [
      //Adds more notices similar to /activity/get
      // {
      //   created: 214,
      //   mst_activity_id: 1,
      //   mst_activity_type_id: 1,
      //   text: "Notice 1",
      //   user_id: "",
      // },
      // {
      //   created: 214,
      //   mst_activity_id: 2,
      //   mst_activity_type_id: 2,
      //   text: "Notice 2",
      //   user_id: "",
      // },
      // {
      //   created: 214,
      //   mst_activity_id: 3,
      //   mst_activity_type_id: 3,
      //   text: "Notice 3",
      //   user_id: "",
      // },
      // {
      //   created: 214,
      //   mst_activity_id: 4,
      //   mst_activity_type_id: 4,
      //   text: "Notice 4",
      //   user_id: "",
      // },
      // {
      //   created: 214,
      //   mst_activity_id: 5,
      //   mst_activity_type_id: 5,
      //   text: "Notice 5",
      //   user_id: "",
      // },
    ],
    free_auto: 0,
    fuwafuwa_time: Date.now(),
    increase_info: {
      max_num: Math.max(FREE_BUNS.max, FREE_BUNS.now + 1),
      now_num: FREE_BUNS.now,
      remain_time: FREE_BUNS.remain,
    },
    invite_num: 0,
    // Il numerino rosso sulla bussola (探検ナビ): voci ancora da riscattare.
    navigationNum: conteggiNavigazione(userDoc),
    offer_products: [
      // {
      //   additional_point:0,
      //   additional_state:0,
      //   amount:0,
      //   banner:"",
      //   explain:"",
      //   id:"",
      //   is_started:0,
      //   name:"",
      //   remain:0,
      //   start:0,
      //   state:0,
      // }
    ],
    purchase_increase_info: [
      // {
      //   end_timestamp:0,
      //   product_id:"",
      //   sale_id:0,
      //   sale_type:0
      // }
    ],
    purchase_stamp_info: [
      // {
      //   display_idx:0,
      //   end:0,
      //   mst_stamp_set_id:0,
      //   remain_time:0,
      //   start:0
      // }
    ],
    stretch_effect_info: {
      exchange_present: 0,
      free_auto_add: 0,
      free_auto_infinity: 0,
      increase_add: 0,
      increase_inf: 0,
      mst_event_info_id: 3454260853,
      time_info: {
        exchange_present: {
          end: 36000,
          end_remain: 36000,
          start: 0,
          start_remain: 0,
        },
        free_auto_add: {
          end: 36000,
          end_remain: 36000,
          start: 0,
          start_remain: 0,
        },
        free_auto_infinity: {
          end: 36000,
          end_remain: 36000,
          start: 0,
          start_remain: 0,
        },
        increase_add: {
          end: 36000,
          end_remain: 36000,
          start: 0,
          start_remain: 0,
        },
      },
    },
    treasureBanner: {
      type: 2,
      url: '',
    },
    unreadCount: 0,
    new_mail: 0,
    new_present: presentCount,
  };
    encryptAndSend(data, res, req);
  } catch (error) {
    log.error('Error in get:', error);
    encryptAndSend({}, res, req, ERROR_CODE.GENERIC_ERROR, ERROR_CATEGORY.ERROR_DIALOG, 'Notice get failed');
  }
};
