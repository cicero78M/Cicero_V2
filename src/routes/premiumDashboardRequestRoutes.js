import { Router } from 'express';
import {
  createDashboardPremiumRequest,
  getDashboardPremiumRequestContext,
} from '../controller/dashboardPremiumRequestController.js';
import { verifyDashboardToken } from '../middleware/dashboardAuth.js';

const router = Router();

router.use(verifyDashboardToken);
router.get('/request/context', getDashboardPremiumRequestContext);
router.post('/request', createDashboardPremiumRequest);

export default router;
