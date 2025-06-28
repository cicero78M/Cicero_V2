import express from 'express';
import * as controller from '../controller/premiumSubscriptionController.js';

const router = express.Router();

router.get('/', controller.getAllSubscriptions);
router.get('/user/:user_id/active', controller.getActiveSubscription);
router.get('/:id', controller.getSubscriptionById);
router.post('/', controller.createSubscription);
router.put('/:id', controller.updateSubscription);
router.delete('/:id', controller.deleteSubscription);

export default router;
