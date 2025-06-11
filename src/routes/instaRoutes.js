// src/routes/instaRoutes.js
import { Router } from "express";
import { getInstaRekapLikes, getInstaPosts } from "../controller/instaController.js";
import { authRequired } from "../middleware/authMiddleware.js"; // tambahkan import ini

const router = Router();

router.get("/rekap-likes", authRequired, getInstaRekapLikes);
router.get("/posts", authRequired, getInstaPosts);

export default router;
