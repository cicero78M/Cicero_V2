import { Router } from 'express';
import {
  getAmplifyRekap,
  exportAmplifyToSheet
} from '../controller/amplifyController.js';
import { authRequired } from '../middleware/authMiddleware.js';

const router = Router();

router.get('/rekap', authRequired, getAmplifyRekap);
router.post('/export', authRequired, exportAmplifyToSheet);
export default router;
