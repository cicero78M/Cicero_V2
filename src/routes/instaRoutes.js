// src/routes/instaRoutes.js
import { Router } from "express";
import { getInstaRekapLikes } from "../controller/instaController.js";
import { authRequired } from "../middleware/authMiddleware.js"; // tambahkan import ini

const router = Router();

router.get("/rekap-likes", authRequired, getInstaRekapLikes);

export default router;
