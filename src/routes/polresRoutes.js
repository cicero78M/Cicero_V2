import { Router } from 'express';
import { searchPolresAccounts } from '../controller/polresController.js';
import { authRequired } from '../middleware/authMiddleware.js';

const router = Router();

router.get('/search', authRequired, searchPolresAccounts);

export default router;
