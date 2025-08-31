// src/routes/likesRoutes.js
import { Router } from "express";
import { getDitbinmasLikes } from "../controller/likesController.js";

const router = Router();
router.get("/instagram", getDitbinmasLikes);

export default router;
