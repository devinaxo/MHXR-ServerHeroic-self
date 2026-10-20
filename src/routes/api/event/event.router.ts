import { Router } from 'express';
import * as eventController from './event.controller.js';
import { validate } from '../../../middleware/validation.js';
import { SessionOnlySchema } from '../../../schemas/common.schema.js';

const eventRouter = Router();

eventRouter.post('/info/get', validate(SessionOnlySchema), eventController.infoGet);
eventRouter.post('/limitedskill/get', validate(SessionOnlySchema), eventController.limitedskillGet);
// Event shop (Hunter Fest Flag P). Niente validate(): la richiesta porta campi
// (mst_event_info_id, mst_shop_item_id) che non hanno uno schema condiviso.
eventRouter.post('/shop/list', eventController.eventShopList);
eventRouter.post('/shop/buy', eventController.eventShopBuy);

export default eventRouter;
