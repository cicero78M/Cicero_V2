// src/routes/dashboardRoutes.js
import { Router } from "express";
import { getDashboardStats } from "../controller/dashboardController.js";
import { analyzeInstagramJson } from "../controller/socialMediaController.js";
const router = Router();

router.get("/stats", getDashboardStats);
router.post("/social-media/instagram/analysis", analyzeInstagramJson);

export default router;
