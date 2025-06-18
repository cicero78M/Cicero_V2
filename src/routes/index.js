import express from 'express';
import userRoutes from './userRoutes.js';
import clientRoutes from './clientRoutes.js';
import authRoutes from './authRoutes.js';
import dashboardRoutes from "./dashboardRoutes.js";
import instaRoutes from "./instaRoutes.js";
import oauthRoutes from './oauthRoutes.js';
import tiktokRoutes from "./tiktokRoutes.js";
import metaRoutes from './metaRoutes.js';
import logRoutes from './logRoutes.js';

const router = express.Router();

router.use('/clients', clientRoutes);
router.use('/users', userRoutes);
router.use('/auth', authRoutes);
router.use("/dashboard", dashboardRoutes);
router.use("/insta", instaRoutes);
router.use("/tiktok", tiktokRoutes);
router.use('/oauth', oauthRoutes);
router.use('/metadata', metaRoutes);
router.use('/logs', logRoutes);


export default router;


