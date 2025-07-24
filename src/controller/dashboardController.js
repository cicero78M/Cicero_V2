// src/controller/dashboardController.js
import { getAllClients } from "../model/clientModel.js";
import { getAllUsers } from "../model/userModel.js";
import { getPostsTodayByClient as getInstaPostsTodayByClient } from "../model/instaPostModel.js";
import { getPostsTodayByClient as getTiktokPostsTodayByClient } from "../model/tiktokPostModel.js";
import { sendConsoleDebug } from "../middleware/debugHandler.js";


export async function getDashboardStats(req, res) {
  try {
    const client_id = req.query.client_id || req.user?.client_id || req.headers["x-client-id"];
    if (!client_id) return res.status(400).json({ success: false, message: "client_id wajib diisi" });

    const [clients, users, igPosts, ttPosts] = await Promise.all([
      getAllClients(),
      getAllUsers(client_id), // <- ini
      getInstaPostsTodayByClient(client_id),
      getTiktokPostsTodayByClient(client_id),
    ]);

    // === FILTER HANYA USER AKTIF
    const activeUsers = Array.isArray(users) ? users.filter(u => u.status === true) : [];

    res.json({
      success: true,
      data: {
        client_id,
        clients: Array.isArray(clients) ? clients.length : 0,
        users: activeUsers.length,        // HANYA YANG AKTIF
        igPosts: Array.isArray(igPosts) ? igPosts.length : 0,
        ttPosts: Array.isArray(ttPosts) ? ttPosts.length : 0,
      },
    });
  } catch (err) {
    sendConsoleDebug({ tag: 'DASHBOARD', msg: `Error getDashboardStats: ${err.message}` });
    res.status(500).json({ success: false, message: err.message });
  }
}

