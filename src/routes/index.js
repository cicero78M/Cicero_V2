import express from 'express';
import userRoutes from './userRoutes.js';
import clientRoutes from './clientRoutes.js';
import authRoutes from './authRoutes.js';
import dashboardRoutes from "./dashboardRoutes.js";
import instaRoutes from "./instaRoutes.js";
import quoteRoutes from './quoteRoutes.js';
import oauthRoutes from './oauthRoutes.js';
import tiktokRoutes from "./tiktokRoutes.js";
import metaRoutes from './metaRoutes.js';
import logRoutes from './logRoutes.js';
import linkReportRoutes from './linkReportRoutes.js';
import linkReportKhususRoutes from './linkReportKhususRoutes.js';
import amplifyRoutes from './amplifyRoutes.js';
import amplifyKhususRoutes from './amplifyKhususRoutes.js';
import editorialEventRoutes from './editorialEventRoutes.js';
import approvalRequestRoutes from './approvalRequestRoutes.js';
import pressReleaseDetailRoutes from './pressReleaseDetailRoutes.js';
import premiumRequestRoutes from './premiumRequestRoutes.js';
import {
  exportAmplifyToSheet,
  downloadAmplifyExcel
} from '../controller/amplifyController.js';

const router = express.Router();

router.use('/clients', clientRoutes);
router.use('/users', userRoutes);
router.use('/auth', authRoutes);
router.use("/dashboard", dashboardRoutes);
router.use("/insta", instaRoutes);
router.use("/tiktok", tiktokRoutes);
router.use('/quotes', quoteRoutes);
router.use('/oauth', oauthRoutes);
router.use('/metadata', metaRoutes);
router.use('/logs', logRoutes);
router.use('/link-reports', linkReportRoutes);
router.use('/link-reports-khusus', linkReportKhususRoutes);
router.use('/events', editorialEventRoutes);
router.use('/approvals', approvalRequestRoutes);
router.use('/press-release-details', pressReleaseDetailRoutes);
router.use('/amplify', amplifyRoutes);
router.use('/amplify-khusus', amplifyKhususRoutes);
router.use('/premium-requests', premiumRequestRoutes);
router.post('/export-amplify', exportAmplifyToSheet);
router.post('/download-amplify', downloadAmplifyExcel);

export default router;


