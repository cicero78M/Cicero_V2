import { Router } from 'express';
import { init, searchInstagram, fetchInfo } from '../controller/poldaController.js';
import { authRequired } from '../middleware/authMiddleware.js';

const router = Router();

router.post('/init', authRequired, init);
router.post('/search-instagram', authRequired, searchInstagram);
router.post('/fetch-info', authRequired, fetchInfo);

export default router;
