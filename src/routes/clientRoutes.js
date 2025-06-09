import express from "express";
import * as clientController from "../controller/clientController.js";
import { authRequired } from "../middleware/authMiddleware.js"; // pastikan punya middleware ini


const router = express.Router();

// === CRUD Dasar ===
router.get("/", clientController.getAllClients);
router.get("/active", clientController.getActiveClients);
router.get("/:client_id", clientController.getClientById);
router.put("/:client_id", clientController.updateClient);
router.delete("/:client_id", clientController.deleteClient);

// === Visualisasi Data / Analytics ===

// Semua user di bawah client
router.get("/:client_id/users", authRequired, clientController.getUsers);

// Semua posting Instagram milik client
router.get("/:client_id/posts/instagram", authRequired, clientController.getInstagramPosts);
// Semua like per posting Instagram client
router.get(
  "/:client_id/posts/instagram/likes",
  clientController.getInstagramLikes
);

// Semua posting TikTok milik client
router.get("/:client_id/posts/tiktok", authRequired, clientController.getTiktokPosts);
// Semua komentar per posting TikTok client
router.get(
  "/:client_id/posts/tiktok/comments",
  clientController.getTiktokComments
);

// Ringkasan aktivitas client (dashboard)
router.get("/:client_id/summary", authRequired, clientController.getSummary);

// Profil client
router.get("/profile", authRequired, clientController.getClientProfile);

export default router;
