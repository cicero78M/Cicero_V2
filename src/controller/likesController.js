import { getRekapLikesByClient } from "../model/instaLikeModel.js";
import { sendConsoleDebug } from "../middleware/debugHandler.js";

export async function getDitbinmasLikes(req, res) {
  const periode = req.query.periode || "harian";
  const tanggal = req.query.tanggal;
  const startDate = req.query.start_date || req.query.tanggal_mulai;
  const endDate = req.query.end_date || req.query.tanggal_selesai;

  try {
    sendConsoleDebug({ tag: "LIKES", msg: `getDitbinmasLikes ${periode} ${tanggal || ''} ${startDate || ''} ${endDate || ''}` });
    const { rows, totalKonten } = await getRekapLikesByClient(
      "ditbinmas",
      periode,
      tanggal,
      startDate,
      endDate,
      "ditbinmas"
    );
    const length = Array.isArray(rows) ? rows.length : 0;
    const chartHeight = Math.max(length * 30, 300);

    const threshold = Math.ceil(totalKonten * 0.5);
    const sudahUsers = [];
    const kurangUsers = [];
    const belumUsers = [];
    const noUsernameUsers = [];

    rows.forEach((u) => {
      if (!u.username || u.username.trim() === "") {
        noUsernameUsers.push(u.username);
      } else if (u.jumlah_like >= threshold) {
        sudahUsers.push(u.username);
      } else if (u.jumlah_like > 0) {
        kurangUsers.push(u.username);
      } else {
        belumUsers.push(u.username);
      }
    });

    const belumUsersCount = belumUsers.length + noUsernameUsers.length;

    res.json({
      success: true,
      data: rows,
      chartHeight,
      totalPosts: totalKonten,
      sudahUsers,
      kurangUsers,
      belumUsers,
      sudahUsersCount: sudahUsers.length,
      kurangUsersCount: kurangUsers.length,
      belumUsersCount,
      noUsernameUsersCount: noUsernameUsers.length,
      usersCount: length,
    });
  } catch (err) {
    sendConsoleDebug({ tag: "LIKES", msg: `Error getDitbinmasLikes: ${err.message}` });
    const code = err.statusCode || err.response?.status || 500;
    res.status(code).json({ success: false, message: err.message });
  }
}
