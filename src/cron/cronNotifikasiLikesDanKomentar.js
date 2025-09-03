import cron from "node-cron";
import dotenv from "dotenv";
dotenv.config();
import { query } from "../db/index.js";
import waClient, { waitForWaReady } from "../service/waService.js";
import { safeSendMessage } from "../utils/waHelper.js";

import { getUsersByClient } from "../model/userModel.js";
import { getShortcodesTodayByClient } from "../model/instaPostModel.js";
import { getLikesByShortcode } from "../model/instaLikeModel.js";
import { getPostsTodayByClient } from "../model/tiktokPostModel.js";
import { getCommentsByVideoId } from "../model/tiktokCommentModel.js";

// Helper format nomor WA menjadi 62xxx@c.us
function formatToWhatsAppId(nohp) {
  let number = String(nohp).replace(/\D/g, "");
  if (!number.startsWith("62")) number = "62" + number.replace(/^0/, "");
  return `${number}@c.us`;
}

// Format nama (menyebut pangkat & nama)
function formatNama(user) {
  return [user.title, user.nama].filter(Boolean).join(" ");
}

// --- MAIN JOB ---
export async function cronNotifikasiAbsenLikesKomentar() {
  console.log("[CRON] Mulai pengecekan tugas Likes & Komentar seluruh client...");
  try {
    await waitForWaReady();
  } catch (err) {
    console.error(`[CRON] WA not ready: ${err.message}`);
    return;
  }
  // Ambil seluruh client aktif
  const { rows: clients } = await query("SELECT client_id, nama FROM clients WHERE client_status = true");
  for (const client of clients) {
    const client_id = client.client_id;
    // Ambil user aktif untuk client
    const users = await getUsersByClient(client_id);
    if (!users.length) continue;

    // ================================
    // IG: Likes
    // ================================
    const shortcodes = await getShortcodesTodayByClient(client_id);
    // Map: user_id -> set shortcodes yang belum di-like
    const likesStatus = {};
    for (const u of users) likesStatus[u.user_id] = new Set(shortcodes);

    for (const shortcode of shortcodes) {
      const likes = await getLikesByShortcode(shortcode);
      const likesSet = new Set(likes.map((l) => (l || "").toLowerCase()));
      for (const u of users) {
        if (u.insta && likesSet.has(u.insta.toLowerCase())) {
          likesStatus[u.user_id].delete(shortcode);
        }
      }
    }

    // ================================
    // TikTok: Komentar
    // ================================
    const posts = await getPostsTodayByClient(client_id);
    // Map: user_id -> set video_id yang belum dikomentari
    const komentarStatus = {};
    const postIds = posts.map(p => p.video_id || p.id);
    for (const u of users) komentarStatus[u.user_id] = new Set(postIds);

    for (const post of posts) {
      const video_id = post.video_id || post.id;
      const komentar = await getCommentsByVideoId(video_id);
      let commentsArr = Array.isArray(komentar?.comments) ? komentar.comments : [];
      commentsArr = commentsArr.map((c) =>
        typeof c === "string"
          ? c.replace(/^@/, "").toLowerCase()
          : (c && typeof c === "object" ? (c.user?.unique_id || c.username || "").replace(/^@/, "").toLowerCase() : "")
      ).filter(Boolean);
      const komentarSet = new Set(commentsArr);
      for (const u of users) {
        if (u.tiktok && komentarSet.has(u.tiktok.replace(/^@/, "").toLowerCase())) {
          komentarStatus[u.user_id].delete(video_id);
        }
      }
    }

    // ================================
    // Kirim Notifikasi (Likes/Komentar belum lengkap)
    // ================================
    for (const user of users) {
      if (user.exception === true) continue;
      if (!user.whatsapp || String(user.whatsapp).length < 8) continue;

      const belumLikes = likesStatus[user.user_id].size > 0;
      const belumKomentar = komentarStatus[user.user_id].size > 0;
      if (!belumLikes && !belumKomentar) continue; // Sudah dua-duanya

      // Kumpulkan list link yang belum dilaksanakan
      let listLink = [];
      if (belumLikes) {
        listLink.push(...[...likesStatus[user.user_id]].map((sc) => `https://instagram.com/p/${sc}`));
      }
      if (belumKomentar) {
        const client_tiktok = user.tiktok ? user.tiktok.replace(/^@/, "") : "-";
        listLink.push(
          ...[...komentarStatus[user.user_id]].map(
            (id) =>
              `https://www.tiktok.com/@${client_tiktok}/video/${id}`
          )
        );
      }

      // --- Format Pesan ---
      let pesan =
        `*Pesan Notifikasi*\n` +
        `Bpk/Ibu ${formatNama(user)}\n\n` +
        `Sistem kami membaca bahwa Anda *belum melaksanakan Likes dan/atau Komentar* pada Konten dari Akun Official berikut:\n\n`;

      pesan += listLink.join("\n") + "\n\n";
      pesan +=
        "Silahkan segera melaksanakan Likes dan Komentar pada kesempatan pertama. Terimakasih.\n\n";
      pesan +=
        "Anda menerima pesan otomatis ini karena nomor ini terdaftar sesuai dengan Nama User tercantum.\n";
      pesan +=
        "_Silakan save nomor WhatsApp bot Pegiat Medsos ini untuk kemudahan notifikasi berikutnya._\n\n";
      pesan += "Pesan ini dikirim oleh *Cicero System* — Sistem Monitoring & Notifikasi Media Sosial POLRI.";

      // --- Kirim pesan ---
      try {
        await safeSendMessage(
          waClient,
          formatToWhatsAppId(user.whatsapp),
          pesan
        );
        console.log(
          `[WA] Notifikasi dikirim ke ${user.nama} (${user.whatsapp})`
        );
        await new Promise((resolve) => setTimeout(resolve, 10000)); // JEDA 10 DETIK
      } catch (err) {
        console.error(`[WA] Gagal kirim notifikasi ke ${user.nama} (${user.whatsapp}): ${err.message}`);
      }
    }
  }
  console.log("[CRON] Notifikasi absen likes/komentar selesai!");
}

// Jalankan setiap jam 12:00, 16:00, dan 19:00 WIB
cron.schedule(
  "10 16 * * *",
  () =>
    cronNotifikasiAbsenLikesKomentar().catch((err) =>
      console.error(
        `[CRON] Error notifikasi likes/komentar: ${err.message}`
      )
    ),
  { timezone: "Asia/Jakarta" }
);

