// src/controller/dashboardController.js
import { getAllClients } from "../model/clientModel.js";
import { getAllUsers } from "../model/userModel.js";
import { countPostsByClient as countInstaPostsByClient } from "../model/instaPostModel.js";
import { countPostsByClient as countTiktokPostsByClient } from "../model/tiktokPostModel.js";
import { sendConsoleDebug } from "../middleware/debugHandler.js";


export async function getDashboardStats(req, res) {
  try {
    const client_id = req.query.client_id || req.user?.client_id || req.headers["x-client-id"];
    if (!client_id) return res.status(400).json({ success: false, message: "client_id wajib diisi" });

    const periode = req.query.periode || 'harian';
    const tanggal = req.query.tanggal;
    const start_date = req.query.start_date;
    const end_date = req.query.end_date;

    const [clients, users, igPostCount, ttPostCount] = await Promise.all([
      getAllClients(),
      getAllUsers(client_id), // <- ini
      countInstaPostsByClient(client_id, periode, tanggal, start_date, end_date),
      countTiktokPostsByClient(client_id, periode, tanggal, start_date, end_date),
    ]);

    // === FILTER HANYA USER AKTIF
    const activeUsers = Array.isArray(users) ? users.filter(u => u.status === true) : [];

    res.json({
      success: true,
      data: {
        client_id,
        clients: Array.isArray(clients) ? clients.length : 0,
        users: activeUsers.length,        // HANYA YANG AKTIF
        igPosts: igPostCount,
        ttPosts: ttPostCount,
      },
    });
  } catch (err) {
    sendConsoleDebug({ tag: 'DASHBOARD', msg: `Error getDashboardStats: ${err.message}` });
    res.status(500).json({ success: false, message: err.message });
  }
}

