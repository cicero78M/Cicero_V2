import express from 'express';
import * as controller from '../controller/subscriptionConfirmationController.js';

const router = express.Router();

router.post('/', controller.sendConfirmation);

export default router;
