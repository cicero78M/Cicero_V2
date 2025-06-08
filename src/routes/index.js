import express from 'express';
import userRoutes from './userRoutes.js';
import clientRoutes from './clientRoutes.js';
import authRoutes from './authRoutes.js';
import dashboardRoutes from "./dashboardRoutes.js";
import instaRoutes from "./instaRoutes.js";

const router = express.Router();

router.use('/clients', clientRoutes);
router.use('/users', userRoutes); // Pastikan sudah ada baris ini!
router.use('/auth', authRoutes);
router.use("/dashboard", dashboardRoutes);
router.use("/insta", instaRoutes);


export default router;


