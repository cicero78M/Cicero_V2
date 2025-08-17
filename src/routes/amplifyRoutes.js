import { Router } from 'express';
import { getAmplifyRekap } from '../controller/amplifyController.js';

const router = Router();

router.get('/rekap', getAmplifyRekap);
export default router;
