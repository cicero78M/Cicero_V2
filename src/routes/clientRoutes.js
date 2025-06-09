import express from "express";
import * as clientController from "../controller/clientController.js";

const router = express.Router();

// === CRUD Dasar ===
router.get("/", clientController.getAllClients);
router.get("/active", clientController.getActiveClients);
router.get("/:client_id", clientController.getClientById);
router.put("/:client_id", clientController.updateClient);
router.delete("/:client_id", clientController.deleteClient);

// === Visualisasi Data / Analytics ===
// Semua user di bawah client
router.get("/:client_id/users", clientController.getUsers);

// Semua posting Instagram milik client
router.get("/:client_id/posts/instagram", clientController.getInstagramPosts);
// Semua like per posting Instagram client
router.get(
  "/:client_id/posts/instagram/likes",
  clientController.getInstagramLikes
);

// Semua posting TikTok milik client
router.get("/:client_id/posts/tiktok", clientController.getTiktokPosts);
// Semua komentar per posting TikTok client
router.get(
  "/:client_id/posts/tiktok/comments",
  clientController.getTiktokComments
);

// Ringkasan aktivitas client (dashboard)
router.get("/:client_id/summary", clientController.getSummary);


router.get("/profile", async (req, res) => {
  console.log("==== DEBUG PROFILE ====");
  console.log("Query params:", req.query);
  console.log("User from JWT:", req.user);
  const client_id = req.query.client_id || (req.user && req.user.client_id);
  console.log("Final client_id for query:", JSON.stringify(client_id));

  if (!client_id)
    return res
      .status(400)
      .json({ success: false, message: "client_id required" });

  try {
    const queryText = "SELECT * FROM clients WHERE client_id = $1";
    console.log("RUN SQL:", queryText, "with", client_id);
    const { rows } = await pool.query(queryText, [client_id]);
    console.log("SQL result:", rows);

    const client = rows[0];
    if (!client)
      return res
        .status(404)
        .json({ success: false, message: "Client not found", debug: { rows, client_id } });

    res.json({ success: true, profile: client });
  } catch (err) {
    res
      .status(500)
      .json({ success: false, message: "DB error", error: err.message });
  }
});


export default router;
