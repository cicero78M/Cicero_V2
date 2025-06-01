// src/service/cronService.js

import cron from "node-cron";
import dotenv from "dotenv";
dotenv.config();

import { fetchAndStoreInstaContent } from "./instaFetchService.js";
import { getUsersByClient } from "../model/userModel.js";
import { getShortcodesTodayByClient } from "../model/instaPostModel.js";
import { getLikesByShortcode } from "../model/instaLikeModel.js";
import { pool } from "../config/db.js";
import waClient from "./waService.js";

// Tambahan untuk TikTok
import { fetchAndStoreTiktokContent } from "./tiktokFetchService.js";
import { fetchAndStoreTiktokComments } from "./tiktokCommentService.js";
import { getPostsTodayByClient } from "../model/tiktokPostModel.js";
import { getCommentsByVideoId } from "../model/tiktokCommentModel.js";

// IG konstanta, helper, dll
const hariIndo = [
  "Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu",
];
const ADMIN_WHATSAPP = (process.env.ADMIN_WHATSAPP || "")
  .split(",")
  .map((n) => n.trim())
  .filter(Boolean);

function getAdminWAIds() {
  return ADMIN_WHATSAPP.map((n) =>
    n.endsWith("@c.us") ? n : n.replace(/[^0-9]/g, "") + "@c.us"
  );
}
function groupByDivision(users) {
  const divGroups = {};
  users.forEach((u) => {
    const div = u.divisi || "-";
    if (!divGroups[div]) divGroups[div] = [];
    divGroups[div].push(u);
  });
  return divGroups;
}
function formatName(u) {
  return `${u.title ? u.title + " " : ""}${u.nama}${
    u.tiktok ? ` : ${u.tiktok}` : ""
  }${u.insta ? ` : ${u.insta}` : ""}`;
}

// === IG CRON: Absensi Likes Akumulasi Belum ===
async function getActiveClientsIG() {
  const res = await pool.query(
    `SELECT client_id, client_insta FROM clients WHERE client_status = true AND client_insta_status = true AND client_insta IS NOT NULL`
  );
  return res.rows;
}

async function absensiLikesAkumulasiBelum(client_id) {
  const now = new Date();
  const hari = hariIndo[now.getDay()];
  const tanggal = now.toLocaleDateString("id-ID");
  const jam = now.toLocaleTimeString("id-ID", { hour12: false });

  const users = await getUsersByClient(client_id);
  const shortcodes = await getShortcodesTodayByClient(client_id);

  if (!shortcodes.length)
    return `Tidak ada konten IG untuk *Client*: *${client_id}* hari ini.`;

  const userStats = {};
  users.forEach((u) => {
    userStats[u.user_id] = { ...u, count: 0 };
  });

  for (const shortcode of shortcodes) {
    const likes = await getLikesByShortcode(shortcode);
    const likesSet = new Set((likes || []).map((x) => (x || "").toLowerCase()));
    users.forEach((u) => {
      if (
        u.insta &&
        u.insta.trim() !== "" &&
        likesSet.has(u.insta.toLowerCase())
      ) {
        userStats[u.user_id].count += 1;
      }
    });
  }

  const totalKonten = shortcodes.length;
  let sudah = [], belum = [];
  Object.values(userStats).forEach((u) => {
    if (
      u.insta &&
      u.insta.trim() !== "" &&
      u.count >= Math.ceil(totalKonten / 2)
    ) {
      sudah.push(u);
    } else {
      belum.push(u);
    }
  });

  const kontenLinks = shortcodes.map(
    (sc) => `https://www.instagram.com/p/${sc}`
  );

  let msg =
    `Mohon Ijin Komandan,\n\nMelaporkan Rekap Pelaksanaan Komentar dan Likes pada Akun Official :\n\n` +
    `📋 Rekap Akumulasi Likes IG\n*Client*: *${client_id}*\n${hari}, ${tanggal}\nJam: ${jam}\n` +
    `Jumlah Konten: ${totalKonten}\nDaftar Link Konten:\n${kontenLinks.join(
      "\n"
    )}\n\n` +
    `Jumlah user: *${users.length}*\n✅ Sudah melaksanakan: *${sudah.length}*\n❌ Belum melaksanakan: *${belum.length}*\n\n`;

  if (sudah.length) {
    const sudahDiv = groupByDivision(sudah);
    msg += `✅ Sudah melaksanakan (${sudah.length} user):\n`;
    Object.entries(sudahDiv).forEach(([div, list]) => {
      msg += `*${div}* (${list.length} user):\n`;
      msg += list.map((u) => `- ${formatName(u)}`).join("\n") + "\n";
    });
  } else {
    msg += `✅ Sudah melaksanakan: -\n`;
  }
  if (belum.length) {
    const belumDiv = groupByDivision(belum);
    msg += `\n❌ Belum melaksanakan (${belum.length} user):\n`;
    Object.entries(belumDiv).forEach(([div, list]) => {
      msg += `*${div}* (${list.length} user):\n`;
      msg +=
        list
          .map(
            (u) =>
              `- ${formatName(u)}${
                !u.insta ? " (belum mengisi data insta)" : ""
              }`
          )
          .join("\n") + "\n";
    });
  } else {
    msg += `\n❌ Belum melaksanakan: -\n`;
  }

  return msg.trim();
}

// === Rekap Likes IG per Client ===
async function rekapLikesIG(client_id) {
  const shortcodes = await getShortcodesTodayByClient(client_id);
  if (!shortcodes.length) return null;

  let totalLikes = 0;
  let detailLikes = [];
  for (const sc of shortcodes) {
    const likes = await getLikesByShortcode(sc);
    const jumlahLikes = (likes || []).length;
    totalLikes += jumlahLikes;
    detailLikes.push({
      shortcode: sc,
      link: `https://www.instagram.com/p/${sc}`,
      jumlahLikes,
    });
  }
  let msg =
    `📊 Rekap Likes IG\n*Client*: *${client_id}*\n` +
    `Jumlah konten hari ini: *${shortcodes.length}*\n` +
    `Total likes semua konten: *${totalLikes}*\n\n` +
    `Rincian:\n`;
  detailLikes.forEach((d) => {
    msg += `- ${d.link}: ${d.jumlahLikes} like\n`;
  });
  return msg.trim();
}

// === CRON IG: Likes ===
cron.schedule(
  "3 6-22 * * *",
  async () => {
    console.log(
      "[CRON IG] Mulai tugas fetchInsta & absensiLikes akumulasi belum..."
    );
    try {
      const clients = await getActiveClientsIG();
      const keys = [
        "code", "caption", "like_count", "taken_at", "comment_count",
      ];
      const fetchSummary = await fetchAndStoreInstaContent(keys);

      let debugMsg = `[CRON IG] Ringkasan fetch Instagram\n`;
      debugMsg += `Tanggal: ${new Date().toLocaleString("id-ID", {
        timeZone: "Asia/Jakarta",
      })}\n`;
      if (fetchSummary && typeof fetchSummary === "object") {
        Object.entries(fetchSummary).forEach(([client, stat]) => {
          debugMsg += `Client: ${client}\n  - Jumlah post hari ini: ${
            stat.count || 0
          }\n`;
          if (stat.error) debugMsg += `  - Error: ${stat.error}\n`;
        });
      } else {
        debugMsg += "Fetch selesai (tidak ada summary detail).";
      }
      for (const admin of getAdminWAIds()) {
        try {
          await waClient.sendMessage(admin, debugMsg);
        } catch (e) {}
      }
      console.log(debugMsg);

      for (const client of clients) {
        // --- Rekap Likes IG ---
        const rekapMsg = await rekapLikesIG(client.client_id);
        if (rekapMsg) {
          for (const admin of getAdminWAIds()) {
            try {
              await waClient.sendMessage(admin, rekapMsg);
              console.log(
                `[CRON IG] Sent rekap likes IG client=${client.client_id} to ${admin}`
              );
            } catch (waErr) {
              console.error(
                `[CRON IG ERROR] send rekap likes to ${admin}:`,
                waErr.message
              );
            }
          }
        }

        // --- Absensi Likes IG ---
        const msg = await absensiLikesAkumulasiBelum(client.client_id);
        if (msg && msg.length > 0) {
          for (const admin of getAdminWAIds()) {
            try {
              await waClient.sendMessage(admin, msg);
              console.log(
                `[CRON IG] Sent absensi IG client=${client.client_id} to ${admin}`
              );
            } catch (waErr) {
              console.error(
                `[CRON IG ERROR] send WA to ${admin}:`,
                waErr.message
              );
            }
          }
        }
      }

      console.log("[CRON IG] Laporan absensi likes berhasil dikirim ke admin.");
    } catch (err) {
      console.error("[CRON IG ERROR]", err);
      for (const admin of getAdminWAIds()) {
        try {
          await waClient.sendMessage(
            admin,
            `[CRON IG ERROR] ${err.message || err}`
          );
        } catch (waErr) {
          console.error(
            `[CRON IG ERROR] Gagal kirim error ke ${admin}:`,
            waErr.message
          );
        }
      }
    }
  },
  {
    timezone: "Asia/Jakarta",
  }
);

// =================== CRON TIKTOK ======================

async function getActiveClientsTiktok() {
  const res = await pool.query(
    `SELECT client_id FROM clients WHERE client_status = true AND client_tiktok IS NOT NULL`
  );
  return res.rows.map(row => row.client_id);
}

/**
 * Kirim laporan absensi komentar TikTok per post (mode default) ke seluruh admin.
 */
async function absensiKomentarTiktok(client_id, posts) {
  const users = await getUsersByClient(client_id);
  if (!posts || posts.length === 0) return;

  const now = new Date();
  const hari = hariIndo[now.getDay()];
  const tanggal = now.toLocaleDateString("id-ID");
  const jam = now.toLocaleTimeString("id-ID", { hour12: false });
  const headerLaporan = `Mohon Ijin Komandan,\n\nMelaporkan Rekap Pelaksanaan Komentar pada Akun Official TikTok:\n\n`;

  for (const post of posts) {
    const video_id = post.video_id || post.id;
    const komentar = await getCommentsByVideoId(video_id);
    const commentsArr = Array.isArray(komentar?.comments) ? komentar.comments : [];
    const usernameSet = new Set(
      commentsArr.map((k) => (k.user?.unique_id || k.username || "").toLowerCase())
    );
    const sudahPerSatfung = {};
    const belumPerSatfung = {};
    let totalSudah = 0, totalBelum = 0;

    users.forEach((u) => {
      const satfung = u.divisi || "-";
      const nama = [u.title, u.nama].filter(Boolean).join(" ");
      const tiktokUsername = (u.tiktok || "").replace(/^@/, "");
      if (
        u.tiktok &&
        u.tiktok.trim() !== "" &&
        usernameSet.has(tiktokUsername.toLowerCase())
      ) {
        if (!sudahPerSatfung[satfung]) sudahPerSatfung[satfung] = [];
        sudahPerSatfung[satfung].push(`${nama} : ${u.tiktok}`);
        totalSudah++;
      } else {
        if (!belumPerSatfung[satfung]) belumPerSatfung[satfung] = [];
        const label =
          u.tiktok && u.tiktok.trim() !== ""
            ? `${nama} : ${u.tiktok}`
            : `${nama} : belum mengisi data tiktok`;
        belumPerSatfung[satfung].push(label);
        totalBelum++;
      }
    });

    let msg =
      headerLaporan +
      `📋 Absensi Komentar TikTok\n*Polres*: *${client_id}*\n${hari}, ${tanggal}\nJam: ${jam}\n` +
      `*Video ID:* ${video_id}\n` +
      `*Jumlah user:* ${users.length}\n` +
      `✅ Sudah melaksanakan: *${totalSudah}*\n` +
      `❌ Belum melaksanakan: *${totalBelum}*\n\n`;

    msg += `✅ Sudah melaksanakan (${totalSudah} user):\n`;
    Object.keys(sudahPerSatfung).forEach((satfung) => {
      const arr = sudahPerSatfung[satfung];
      msg += `*${satfung}* (${arr.length} user):\n`;
      arr.forEach((line) => {
        msg += `- ${line}\n`;
      });
      msg += "\n";
    });
    msg += `\n❌ Belum melaksanakan (${totalBelum} user):\n`;
    Object.keys(belumPerSatfung).forEach((satfung) => {
      const arr = belumPerSatfung[satfung];
      msg += `*${satfung}* (${arr.length} user):\n`;
      arr.forEach((line) => {
        msg += `- ${line}\n`;
      });
      msg += "\n";
    });

    // Kirim laporan ke seluruh ADMIN
    for (const wa of getAdminWAIds()) {
      await waClient.sendMessage(wa, msg.trim()).catch(() => {});
    }
  }
}

// === CRON TIKTOK: fetch & absensi komentar ===
cron.schedule(
  "25 6-22 * * *",
  async () => {
    console.log("[CRON TIKTOK] Mulai tugas fetch post & absensi komentar...");
    try {
      const clients = await getActiveClientsTiktok();

      for (const client_id of clients) {
        try {
          // 1. Fetch TikTok post terbaru
          const postsToday = await fetchAndStoreTiktokContent(client_id);
          if (!postsToday || postsToday.length === 0) {
            for (const admin of getAdminWAIds()) {
              await waClient.sendMessage(
                admin,
                `[CRON TIKTOK][${client_id}] Tidak ada post TikTok hari ini.`
              ).catch(() => {});
            }
            continue;
          }
          // 2. Fetch & simpan komentar untuk semua post hari ini
          const postList = await getPostsTodayByClient(client_id);
          for (const [i, post] of postList.entries()) {
            const video_id = post.video_id || post.id;
            for (const admin of getAdminWAIds()) {
              await waClient.sendMessage(
                admin,
                `[CRON TIKTOK][${client_id}] Fetch komentar video_id=${video_id} (${i+1}/${postList.length})`
              ).catch(() => {});
            }
            try {
              const comments = await fetchAndStoreTiktokComments(video_id);
              for (const admin of getAdminWAIds()) {
                await waClient.sendMessage(
                  admin,
                  `[CRON TIKTOK][${client_id}] Sukses fetch & simpan ${comments.length} komentar video_id=${video_id}`
                ).catch(() => {});
              }
            } catch (e) {
              for (const admin of getAdminWAIds()) {
                await waClient.sendMessage(
                  admin,
                  `[CRON TIKTOK][${client_id}] Gagal fetch komentar video_id=${video_id}: ${e.message}`
                ).catch(() => {});
              }
            }
          }

          // 3. Absensi komentar TikTok untuk client
          await absensiKomentarTiktok(client_id, postList);

        } catch (err) {
          for (const admin of getAdminWAIds()) {
            await waClient.sendMessage(
              admin,
              `[CRON TIKTOK][${client_id}] ERROR: ${err.message}`
            ).catch(() => {});
          }
        }
      }
      console.log("[CRON TIKTOK] Laporan absensi komentar berhasil dikirim ke admin.");
    } catch (err) {
      console.error("[CRON TIKTOK ERROR]", err);
      for (const admin of getAdminWAIds()) {
        try {
          await waClient.sendMessage(
            admin,
            `[CRON TIKTOK ERROR] ${err.message || err}`
          );
        } catch (waErr) {
          console.error(
            `[CRON TIKTOK ERROR] Gagal kirim error ke ${admin}:`,
            waErr.message
          );
        }
      }
    }
  },
  {
    timezone: "Asia/Jakarta",
  }
);

// ====== END ======
