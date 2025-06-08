// src/routes/instaRoutes.js
import { Router } from "express";
import { getInstaRekapLikes } from "../controller/instaController.js";
const router = Router();

router.get("/rekap-likes", getInstaRekapLikes);

export default router;
