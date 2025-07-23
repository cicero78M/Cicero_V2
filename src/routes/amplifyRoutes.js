import { Router } from 'express';
import {
  getAmplifyRekap,
  exportAmplifyToSheet,
  downloadAmplifyExcel
} from '../controller/amplifyController.js';
import { authRequired } from '../middleware/authMiddleware.js';

const router = Router();

router.get('/rekap', authRequired, getAmplifyRekap);
router.post('/export', authRequired, exportAmplifyToSheet);
router.post('/download', authRequired, downloadAmplifyExcel);

export default router;
