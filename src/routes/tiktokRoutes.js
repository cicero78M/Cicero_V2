import { Router } from 'express';
import {
  getTiktokComments,
  getTiktokRekapKomentar,
  getTiktokPosts,
  getRapidTiktokProfile,
  getRapidTiktokPosts,
  getRapidTiktokInfo
} from '../controller/tiktokController.js';
import { verifyDashboardToken } from '../middleware/dashboardAuth.js';

const router = Router();

router.use(verifyDashboardToken);
router.get('/comments', getTiktokComments);
router.get('/rekap-komentar', getTiktokRekapKomentar);
router.get('/posts', getTiktokPosts);
router.get('/rapid-profile', getRapidTiktokProfile);
router.get('/rapid-posts', getRapidTiktokPosts);
router.get('/rapid-info', getRapidTiktokInfo);

export default router;
