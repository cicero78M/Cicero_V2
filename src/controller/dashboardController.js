// src/controller/dashboardController.js
import { getAllClients } from "../model/clientModel.js";
import { getAllUsers } from "../model/userModel.js";
import { getPostsTodayByClient as getInstaPostsTodayByClient } from "../model/instaPostModel.js";
import { getPostsTodayByClient as getTiktokPostsTodayByClient } from "../model/tiktokPostModel.js";

export async function getDashboardStats(req, res) {
  try {
    // Dapatkan client_id dari user yang login, jika sistem Anda pakai multi client.
    const client_id = req.query.client_id || req.user?.client_id || req.headers["x-client-id"];
    if (!client_id) return res.status(400).json({ success: false, message: "client_id wajib diisi" });

    const [clients, users, igPosts, ttPosts] = await Promise.all([
      getAllClients(),
      getAllUsers(client_id),
      getInstaPostsTodayByClient(client_id),
      getTiktokPostsTodayByClient(client_id),
    ]);

    res.json({
      success: true,
      data: {
        client_id,
        clients: Array.isArray(clients) ? clients.length : 0,
        users: Array.isArray(users) ? users.length : 0,
        igPosts: Array.isArray(igPosts) ? igPosts.length : 0,
        ttPosts: Array.isArray(ttPosts) ? ttPosts.length : 0,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}
