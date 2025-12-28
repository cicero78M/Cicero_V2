// src/routes/dashboardRoutes.js
import { Router } from "express";
import { getDashboardStats } from "../controller/dashboardController.js";
import { analyzeInstagramJson } from "../controller/socialMediaController.js";
import { createDashboardPremiumRequest } from "../controller/dashboardPremiumRequestController.js";
import { approveDashboardUser, rejectDashboardUser } from "../controller/dashboardUserController.js";
import { verifyDashboardToken } from "../middleware/dashboardAuth.js";
import { getDashboardWebLoginRecap } from "../controller/loginLogController.js";
const router = Router();

router.use(verifyDashboardToken);
router.get("/stats", getDashboardStats);
router.post("/social-media/instagram/analysis", analyzeInstagramJson);
router.put("/users/:id/approve", approveDashboardUser);
router.put("/users/:id/reject", rejectDashboardUser);
router.get("/login-web/recap", getDashboardWebLoginRecap);
router.post("/premium-access/requests", createDashboardPremiumRequest);

export default router;
