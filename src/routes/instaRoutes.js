// src/routes/instaRoutes.js
import { Router } from "express";
import { getInstaRekapLikes, getInstaPosts, getRapidInstagramPosts } from "../controller/instaController.js";
import { authRequired } from "../middleware/authMiddleware.js"; // tambahkan import ini

const router = Router();

router.get("/rekap-likes", authRequired, getInstaRekapLikes);
router.get("/posts", authRequired, getInstaPosts);
router.get("/rapid-posts", authRequired, getRapidInstagramPosts);

export default router;
