import { Router } from 'express';
import { getTiktokComments, getTiktokRekapKomentar } from '../controller/tiktokController.js';
import { authRequired } from '../middleware/authMiddleware.js';

const router = Router();

router.get('/comments', authRequired, getTiktokComments);
router.get('/rekap-komentar', authRequired, getTiktokRekapKomentar);

export default router;
