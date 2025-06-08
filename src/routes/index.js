import express from 'express';
import userRoutes from './userRoutes.js';
import clientRoutes from './clientRoutes.js';
import authRoutes from './authRoutes.js';

const router = express.Router();

router.use('/clients', clientRoutes);
router.use('/users', userRoutes); // Pastikan sudah ada baris ini!
router.use('/auth', authRoutes);

export default router;
