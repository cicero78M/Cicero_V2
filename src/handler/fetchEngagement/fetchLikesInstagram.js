// src/handler/fetchEngagement/fetchLikesInstagram.js

import { fetchAndStoreLikes } from "../../service/instaLikeService.js"; // pastikan path benar
import { sendDebug } from "../../utils/debugHelper.js";
import { pool } from "../../config/db.js";

/**
 * Handler fetch likes Instagram untuk 1 client
 * @param {*} waClient
 * @param {*} chatId
 * @param {*} client_id
 */
export async function handleFetchLikesInstagram(waClient, chatId, client_id) {
  try {
    // Ambil semua post IG milik client hari ini
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");
    const { rows } = await pool.query(
      `SELECT shortcode FROM insta_post WHERE client_id = $1 AND DATE(created_at) = $2`,
      [client_id, `${yyyy}-${mm}-${dd}`]
    );

    if (!rows.length) {
      await waClient.sendMessage(chatId, `Tidak ada konten IG hari ini untuk client ${client_id}.`);
      return;
    }

    let sukses = 0, gagal = 0;
    for (const r of rows) {
      try {
        await fetchAndStoreLikes(r.shortcode, client_id);
        sukses++;
      } catch (err) {
        sendDebug({
          tag: "IG FETCH LIKES ERROR",
          msg: `Gagal fetch likes untuk shortcode: ${r.shortcode}, error: ${(err && err.message) || err}`,
          client_id
        });
        gagal++;
      }
    }

    await waClient.sendMessage(
      chatId,
      `✅ Selesai fetch likes IG client ${client_id}. Berhasil: ${sukses}, Gagal: ${gagal}`
    );
  } catch (err) {
    await waClient.sendMessage(
      chatId,
      `❌ Error utama fetch likes IG: ${(err && err.message) || err}`
    );
    sendDebug({
      tag: "IG FETCH LIKES ERROR",
      msg: (err && err.message) || err,
      client_id
    });
  }
}
