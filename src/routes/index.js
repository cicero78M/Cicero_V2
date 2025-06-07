import express from 'express';
import userRoutes from './userRoutes.js';
import clientRoutes from './clientRoutes.js';
import authRoutes from './authRoutes.js';
import { authRequired } from '../middleware/authMiddleware.js';

const router = express.Router();
app.use('/api', authRequired, router); // Kecuali login

router.use('/clients', clientRoutes);
router.use('/users', userRoutes); // Pastikan sudah ada baris ini!
router.use('/auth', authRoutes);

export default router;
