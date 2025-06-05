import dotenv from "dotenv";
dotenv.config();

import { getActiveClientsTiktok, getClientTiktokUsername, rekapKomentarTikTok, formatRekapPostTikTok } from "../handler/fetchAbsensi/tiktok/absensiKomentarTiktok.js";
import { fetchAndStoreTiktokContent } from "../handler/fetchPost/tiktokFetchPost.js";
import { fetchAndStoreTiktokCommentUserList } from "../handler/fetchEngagement/fetchCommentTiktok.js";
import waClient from "../service/waService.js"; // pastikan waClient diexport default

// Fungsi utama: cron TikTok harian (post, komentar, absensi)
export async function cronTiktokHarian(chatId = null) {
  // Step 1: Ambil semua client TikTok aktif
  const clientIds = await getActiveClientsTiktok();

  for (const client_id of clientIds) {
    const username = await getClientTiktokUsername(client_id);

    // Step 2: Fetch & simpan post TikTok hari ini (jika ada)
    const postsToday = await fetchAndStoreTiktokContent(client_id);

    // Step 3: Fetch & merge username komentar (update ke DB)
    await fetchAndStoreTiktokCommentUserList(null, null, client_id);

    // Step 4: Rekap komentar TikTok (untuk absensi/monitoring)
    const rekapKomentar = await rekapKomentarTikTok(client_id, username);

    // Step 5: Kirim rekap ke admin/WA jika chatId diisi
    if (chatId && rekapKomentar) {
      await waClient.sendMessage(chatId, rekapKomentar);
    }
  }
}

// OPTIONAL: Jika ingin rekap post harian juga (format summary postingan)
export async function kirimRekapPostTikTok(chatId = null) {
  const clientIds = await getActiveClientsTiktok();

  for (const client_id of clientIds) {
    const username = await getClientTiktokUsername(client_id);
    const postsToday = await fetchAndStoreTiktokContent(client_id);
    if (chatId && postsToday.length) {
      const msg = formatRekapPostTikTok(client_id, username, postsToday);
      await waClient.sendMessage(chatId, msg);
    }
  }
}
