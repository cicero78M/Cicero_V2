// src/routes/dashboardRoutes.js
import { Router } from "express";
import { getDashboardStats } from "../controller/dashboardController.js";
import { analyzeInstagramJson } from "../controller/socialMediaController.js";
import { verifyDashboardToken } from "../middleware/dashboardAuth.js";
const router = Router();

router.use(verifyDashboardToken);
router.get("/stats", getDashboardStats);
router.post("/social-media/instagram/analysis", analyzeInstagramJson);

export default router;
