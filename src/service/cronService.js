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

// === Helper dan konstanta ===
const hariIndo = [
  "Minggu",
  "Senin",
  "Selasa",
  "Rabu",
  "Kamis",
  "Jumat",
  "Sabtu",
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

// ========== IG CRON ==========

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
  let sudah = [],
    belum = [];
  Object.values(userStats).forEach((u) => {
    // Harus likes di >= setengah jumlah konten untuk "sudah"
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
    `Mohon Ijin Komandan,\n\nMelaporkan Rekap Pelaksanaan Komentar dan Likes pada Akun Official:\n\n` +
    `📋 Rekap Akumulasi Likes IG\n*Client*: *${client_id}*\n${hari}, ${tanggal}\nJam: ${jam}\n` +
    `Jumlah Konten: ${totalKonten}\nDaftar Link Konten:\n${kontenLinks.join(
      "\n"
    )}\n\n` +
    `Jumlah user: *${users.length}*\n` +
    `✅ Sudah melaksanakan: *${sudah.length}*\n` +
    `❌ Belum melaksanakan: *${belum.length}*\n\n`;

  if (belum.length > 0) {
    const belumDiv = groupByDivision(belum);
    msg += `❌ Belum melaksanakan (${belum.length} user):\n`;
    Object.entries(belumDiv).forEach(([div, list]) => {
      msg += `*${div}* (${list.length} user):\n`;
      msg +=
        list
          .map(
            (u) =>
              `- ${formatName(u)}${
                !u.insta ? " (belum mengisi data insta)" : ""
              } (${u.count} konten)`
          )
          .join("\n") + "\n\n";
    });
  } else {
    msg += `❌ Belum melaksanakan: -\n`;
  }

  if (sudah.length > 0) {
    msg += `\n✅ Sudah melaksanakan (${sudah.length} user):\n`;
    const sudahDiv = groupByDivision(sudah);
    Object.entries(sudahDiv).forEach(([div, list]) => {
      msg += `*${div}* (${list.length} user):\n`;
      msg +=
        list.map((u) => `- ${formatName(u)} (${u.count} konten)`).join("\n") +
        "\n\n";
    });
  } else {
    msg += `\n✅ Sudah melaksanakan: -\n`;
  }

  msg += `\nTerimakasih.`;

  return msg.trim();
}

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
  "20 6-22 * * *",
  async () => {
    console.log(
      "[CRON IG] Mulai tugas fetchInsta & absensiLikes akumulasi belum..."
    );
    try {
      const clients = await getActiveClientsIG();
      const keys = [
        "code",
        "caption",
        "like_count",
        "taken_at",
        "comment_count",
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

// ========== TIKTOK CRON ==========

async function getActiveClientsTiktok() {
  const res = await pool.query(
    `SELECT client_id FROM clients WHERE client_status = true AND client_tiktok IS NOT NULL`
  );
  return res.rows.map((row) => row.client_id);
}

cron.schedule(
  "21 6-22 * * *",
  async () => {
    console.log(
      "[CRON TIKTOK] Mulai tugas fetch post & absensi komentar AKUMULASI BELUM (ala handler manual)..."
    );
    try {
      const clients = await getActiveClientsTiktok();

      for (const client_id of clients) {
        try {
          // === 1. FETCH POST TIKTOK ala fetchtiktok# ===
          let posts = [];
          let postsFromApi = [];
          try {
            postsFromApi = await fetchAndStoreTiktokContent(client_id);
          } catch (e) {
            // Optional: kirim error ke admin, tapi lanjut fallback
            for (const admin of getAdminWAIds()) {
              await waClient
                .sendMessage(
                  admin,
                  `[CRON TIKTOK][${client_id}] ERROR API: ${e.message || e}`
                )
                .catch(() => {});
            }
          }

          if (postsFromApi && postsFromApi.length > 0) {
            posts = postsFromApi;
          } else {
            posts = await getPostsTodayByClient(client_id);
            for (const admin of getAdminWAIds()) {
              await waClient
                .sendMessage(
                  admin,
                  `[CRON TIKTOK][${client_id}] ⚠️ Tidak ada post TikTok hari ini dari API, menggunakan data dari database...`
                )
                .catch(() => {});
            }
          }

          if (!posts || posts.length === 0) {
            for (const admin of getAdminWAIds()) {
              await waClient
                .sendMessage(
                  admin,
                  `[CRON TIKTOK][${client_id}] Tidak ada post TikTok hari ini.`
                )
                .catch(() => {});
            }
            continue;
          }

          // === 2. ABSENSI KOMENTAR AKUMULASI BELUM ala absensikomentar#clientid#akumulasi#belum ===
          const users = await getUsersByClient(client_id);

          // Persiapkan mapping statistik komentar per user
          const userStats = {};
          users.forEach((u) => {
            userStats[u.user_id] = { ...u, count: 0 };
          });

          // Loop setiap post dan fetch komentar
          for (const post of posts) {
            const video_id = post.video_id || post.id;
            let commentsArr = [];
            try {
              // Fetch komentar terbaru (force update DB, delay internal sudah di service)
              commentsArr = await fetchAndStoreTiktokComments(video_id);
              // === PATCH: jika komentar hasil API berupa array objek, mapping ke array username lowercase
              if (commentsArr.length && typeof commentsArr[0] === "object") {
                commentsArr = commentsArr
                  .map(
                    (c) =>
                      (c.user?.unique_id || c.username || "")
                        .replace(/^@/, "")
                        .toLowerCase()
                  )
                  .filter(Boolean);
              }
            } catch (err) {
              // Gagal fetch, ambil dari DB
              const komentarDb = await getCommentsByVideoId(video_id);
              commentsArr = Array.isArray(komentarDb?.comments)
                ? komentarDb.comments
                : [];
            }
            // === PENTING: commentsArr pasti array username (string)
            const usernameSet = new Set(
              commentsArr.map((x) => x.toLowerCase())
            );
            users.forEach((u) => {
              const tiktokUsername = (u.tiktok || "").replace(/^@/, "").toLowerCase();
              if (
                u.tiktok &&
                u.tiktok.trim() !== "" &&
                usernameSet.has(tiktokUsername)
              ) {
                userStats[u.user_id].count += 1;
              }
            });
          }

          const totalKonten = posts.length;
          let sudah = [],
            belum = [];
          Object.values(userStats).forEach((u) => {
            // Harus komentar di >= setengah jumlah post untuk dinyatakan "sudah"
            if (
              u.tiktok &&
              u.tiktok.trim() !== "" &&
              u.count >= Math.ceil(totalKonten / 2)
            ) {
              sudah.push(u);
            } else {
              belum.push(u);
            }
          });

          // Format laporan AKUMULASI BELUM (seperti absensikomentar#clientid#akumulasi#belum)
          const now = new Date();
          const hari = hariIndo[now.getDay()];
          const tanggal = now.toLocaleDateString("id-ID");
          const jam = now.toLocaleTimeString("id-ID", { hour12: false });
          const kontenLinks = posts.map(
            (p) =>
              `https://www.tiktok.com/@${p.username || "-"}/video/${
                p.video_id || p.id
              }`
          );

          let msg =
            `Mohon Ijin Komandan,\n\nMelaporkan Rekap Pelaksanaan Komentar pada Akun Official TikTok:\n\n` +
            `📋 Rekap Akumulasi Komentar TikTok\n*Polres*: *${client_id}*\n${hari}, ${tanggal}\nJam: ${jam}\n` +
            `*Jumlah Konten:* ${totalKonten}\n` +
            `*Daftar link video hari ini:*\n${kontenLinks.join("\n")}\n\n` +
            `*Jumlah user:* ${users.length}\n` +
            `✅ Sudah melaksanakan: *${sudah.length}*\n` +
            `❌ Belum melaksanakan: *${belum.length}*\n\n`;

          if (belum.length > 0) {
            // Group by division
            const belumDiv = groupByDivision(belum);
            msg += `❌ Belum melaksanakan (${belum.length} user):\n`;
            Object.entries(belumDiv).forEach(([div, list]) => {
              msg += `*${div}* (${list.length} user):\n`;
              msg +=
                list
                  .map(
                    (u) =>
                      `- ${formatName(u)}${
                        !u.tiktok ? " (belum mengisi data tiktok)" : ""
                      } (${u.count} video)`
                  )
                  .join("\n") + "\n\n";
            });
          } else {
            msg += `❌ Belum melaksanakan: -\n`;
          }

          if (sudah.length > 0) {
            msg += `\n✅ Sudah melaksanakan (${sudah.length} user):\n`;
            const sudahDiv = groupByDivision(sudah);
            Object.entries(sudahDiv).forEach(([div, list]) => {
              msg += `*${div}* (${list.length} user):\n`;
              msg +=
                list
                  .map((u) => `- ${formatName(u)} (${u.count} video)`)
                  .join("\n") + "\n\n";
            });
          } else {
            msg += `\n✅ Sudah melaksanakan: -\n`;
          }

          // Tambahkan ucapan terimakasih di akhir laporan
          msg += `\nTerimakasih.`;

          for (const admin of getAdminWAIds()) {
            await waClient.sendMessage(admin, msg.trim()).catch(() => {});
          }
          console.log(
            `[CRON TIKTOK] Sent absensi komentar TikTok (akumulasi belum) client=${client_id}`
          );
        } catch (err) {
          for (const admin of getAdminWAIds()) {
            await waClient
              .sendMessage(
                admin,
                `[CRON TIKTOK][${client_id}] ERROR: ${err.message}`
              )
              .catch(() => {});
          }
        }
      }
      console.log(
        "[CRON TIKTOK] Laporan absensi komentar (akumulasi belum) berhasil dikirim ke admin."
      );
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

// ===== END =====
