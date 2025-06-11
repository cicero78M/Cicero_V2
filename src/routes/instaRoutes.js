// src/routes/instaRoutes.js
import { Router } from "express";
import { getInstaRekapLikes, getInstaPosts, getRapidInstagramPosts, getRapidInstagramProfile } from "../controller/instaController.js";
import { authRequired } from "../middleware/authMiddleware.js"; // tambahkan import ini

const router = Router();

router.get("/rekap-likes", authRequired, getInstaRekapLikes);
router.get("/posts", authRequired, getInstaPosts);
router.get("/rapid-posts", authRequired, getRapidInstagramPosts);
router.get("/rapid-profile", authRequired, getRapidInstagramProfile);

export default router;
