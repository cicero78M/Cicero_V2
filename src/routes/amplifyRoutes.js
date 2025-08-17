import { Router } from 'express';
import { getAmplifyRekap } from '../controller/amplifyController.js';
import { verifyDashboardToken } from '../middleware/dashboardAuth.js';

const router = Router();

router.get('/rekap', verifyDashboardToken, getAmplifyRekap);
export default router;
