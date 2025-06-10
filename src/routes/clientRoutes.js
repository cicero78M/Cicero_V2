import express from "express";
import * as clientController from "../controller/clientController.js";
import { authRequired } from "../middleware/authMiddleware.js"; // pastikan punya middleware ini


const router = express.Router();
// Routes untuk client
router.get("/", clientController.getAllClients);
// routes profile client
router.get("/profile", authRequired, clientController.getClientProfile);
router.get("/active", clientController.getActiveClients);
router.get("/:client_id", clientController.getClientById);
router.put("/:client_id", clientController.updateClient);
router.delete("/:client_id", clientController.deleteClient);
router.get("/:client_id/users", authRequired, clientController.getUsers);
router.get("/:client_id/posts/instagram", authRequired, clientController.getInstagramPosts);
router.get(
  "/:client_id/posts/instagram/likes",
  clientController.getInstagramLikes
);
router.get("/:client_id/posts/tiktok", authRequired, clientController.getTiktokPosts);
router.get(
  "/:client_id/posts/tiktok/comments",
  clientController.getTiktokComments
);
router.get("/:client_id/summary", authRequired, clientController.getSummary);

// Profil client

export default router;
