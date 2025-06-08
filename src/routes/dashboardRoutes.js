// src/routes/dashboardRoutes.js
import { Router } from "express";
import { getDashboardStats } from "../controller/dashboardController.js";
const router = Router();

router.get("/stats", getDashboardStats);

export default router;
