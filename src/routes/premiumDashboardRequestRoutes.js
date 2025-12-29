import { Router } from 'express';
import { createDashboardPremiumRequest } from '../controller/dashboardPremiumRequestController.js';
import { verifyDashboardToken } from '../middleware/dashboardAuth.js';

const router = Router();

router.use(verifyDashboardToken);
router.post('/request', createDashboardPremiumRequest);

export default router;
