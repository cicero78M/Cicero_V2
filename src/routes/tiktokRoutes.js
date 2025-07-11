import { Router } from 'express';
import {
  getTiktokComments,
  getTiktokRekapKomentar,
  getTiktokPosts,
  getRapidTiktokProfile,
  getRapidTiktokPosts,
  getRapidTiktokInfo
} from '../controller/tiktokController.js';
import { authRequired } from '../middleware/authMiddleware.js';

const router = Router();

router.get('/comments', authRequired, getTiktokComments);
router.get('/rekap-komentar', authRequired, getTiktokRekapKomentar);
router.get('/posts', authRequired, getTiktokPosts);
router.get('/rapid-profile', authRequired, getRapidTiktokProfile);
router.get('/rapid-posts', authRequired, getRapidTiktokPosts);
router.get('/rapid-info', authRequired, getRapidTiktokInfo);

export default router;
