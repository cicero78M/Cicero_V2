import { Router } from 'express';
import { getAmplifyRekap } from '../controller/amplifyController.js';
import { authRequired } from '../middleware/authMiddleware.js';

const router = Router();

router.get('/rekap', authRequired, getAmplifyRekap);

export default router;
