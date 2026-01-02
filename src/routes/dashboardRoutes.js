// src/routes/dashboardRoutes.js
import { Router } from "express";
import { getDashboardStats } from "../controller/dashboardController.js";
import { analyzeInstagramJson } from "../controller/socialMediaController.js";
import { approveDashboardUser, rejectDashboardUser } from "../controller/dashboardUserController.js";
import { verifyDashboardToken } from "../middleware/dashboardAuth.js";
import { getDashboardWebLoginRecap } from "../controller/loginLogController.js";
import { getAnevDashboard } from "../controller/anevController.js";
import { requirePremiumTier } from "../middleware/premiumTierMiddleware.js";
const router = Router();

router.use(verifyDashboardToken);
router.get("/stats", getDashboardStats);
router.get("/anev", requirePremiumTier(["tier1", "tier2"]), getAnevDashboard);
router.post("/social-media/instagram/analysis", analyzeInstagramJson);
router.put("/users/:id/approve", approveDashboardUser);
router.put("/users/:id/reject", rejectDashboardUser);
router.get("/login-web/recap", getDashboardWebLoginRecap);

export default router;
