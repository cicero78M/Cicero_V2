import { Router } from 'express';
import { getTiktokComments } from '../controller/tiktokController.js';
import { authRequired } from '../middleware/authMiddleware.js';

const router = Router();

router.get('/comments', authRequired, getTiktokComments);

export default router;
