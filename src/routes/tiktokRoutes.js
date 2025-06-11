import { Router } from 'express';
import { getTiktokComments, getTiktokRekapKomentar, getTiktokPosts } from '../controller/tiktokController.js';
import { authRequired } from '../middleware/authMiddleware.js';

const router = Router();

router.get('/comments', authRequired, getTiktokComments);
router.get('/rekap-komentar', authRequired, getTiktokRekapKomentar);
router.get('/posts', authRequired, getTiktokPosts);

export default router;
