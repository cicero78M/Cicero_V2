import { Router } from 'express';
import { verifyWebhook, receiveWebhook } from '../controller/instaCallbackController.js';

const router = Router();

router.get('/', verifyWebhook);
router.post('/', receiveWebhook);

export default router;
