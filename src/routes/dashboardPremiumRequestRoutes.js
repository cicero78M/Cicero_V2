import { Router } from 'express';
import { verifyDashboardToken } from '../middleware/dashboardAuth.js';
import {
  confirmDashboardPremiumRequestController,
  createDashboardPremiumRequestController,
  getDashboardPremiumRequestController,
} from '../controller/dashboardPremiumRequestController.js';

const router = Router();

router.use(verifyDashboardToken);
router.post('/request', createDashboardPremiumRequestController);
router.put('/request/:token/confirm', confirmDashboardPremiumRequestController);
router.get('/request/:token', getDashboardPremiumRequestController);

export default router;
