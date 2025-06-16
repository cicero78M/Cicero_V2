// src/routes/instaRoutes.js
import { Router } from "express";
import {
  getInstaRekapLikes,
  getInstaPosts,
  getRapidInstagramPosts,
  getRapidInstagramProfile,
  getRapidInstagramInfo,
  getInstagramProfile,
  getRapidInstagramPostsStore,
  getRapidInstagramPostsByMonth,
  getBasicInstagramPosts,
  getBasicInstagramProfile,
} from "../controller/instaController.js";
import { authRequired } from "../middleware/authMiddleware.js"; // tambahkan import ini

const router = Router();

router.get("/rekap-likes", authRequired, getInstaRekapLikes);
router.get("/posts", authRequired, getInstaPosts);
router.get("/rapid-posts", authRequired, getRapidInstagramPosts);
router.get("/rapid-posts-month", authRequired, getRapidInstagramPostsByMonth);
router.get("/rapid-posts-store", authRequired, getRapidInstagramPostsStore);
router.get("/rapid-profile", authRequired, getRapidInstagramProfile);
router.get("/rapid-info", authRequired, getRapidInstagramInfo);
router.get("/profile", authRequired, getInstagramProfile);
router.get("/basic-posts", authRequired, getBasicInstagramPosts);
router.get("/basic-profile", authRequired, getBasicInstagramProfile);

export default router;
