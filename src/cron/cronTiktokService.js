import cron from "node-cron";
import dotenv from "dotenv";
dotenv.config();

import { fetchAndStoreTiktokContent } from "../service/tiktokFetchService.js";
import { fetchAndStoreTiktokComments } from "../service/tiktokCommentFetchService.js";
import { getPostsTodayByClient } from "../model/tiktokPostModel.js";
import { getUsersByClient } from "../model/userModel.js";
import { getCommentsByVideoId } from "../model/tiktokCommentModel.js";
import { pool } from "../config/db.js";
import waClient from "../service/waService.js";

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
function sortDivisionKeys(keys) {
  const order = ["BAG", "SAT", "POLSEK"];
  return keys.sort((a, b) => {
    const ia = order.findIndex((prefix) => a.toUpperCase().startsWith(prefix));
    const ib = order.findIndex((prefix) => b.toUpperCase().startsWith(prefix));
    return (
      (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib) || a.localeCompare(b)
    );
  });
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

// Ambil client TikTok yang aktif
async function getActiveClientsTiktok() {
  const res = await pool.query(
    `SELECT client_id FROM clients WHERE client_status = true AND client_tiktok IS NOT NULL`
  );
  return res.rows.map((row) => row.client_id);
}
async function getClientTiktokUsername(client_id) {
  try {
    const q = `SELECT client_tiktok FROM clients WHERE client_id = $1 LIMIT 1`;
    const result = await pool.query(q, [client_id]);
    if (result.rows[0] && result.rows[0].client_tiktok)
      return result.rows[0].client_tiktok.replace(/^@/, "");
  } catch (e) {}
  return "-";
}

// Format rekap komentar TikTok
async function rekapKomentarTikTok(client_id, client_tiktok) {
  // Ambil semua post hari ini
  const posts = await getPostsTodayByClient(client_id);
  if (!posts.length) return null;

  let totalKomentar = 0;
  let detailKomentar = [];

  for (const post of posts) {
    const video_id = post.video_id || post.id;
    // Ambil dari database (lebih cepat untuk laporan)
    let komentarDb = await getCommentsByVideoId(video_id);
    let jumlahKomentar = 0;
    if (komentarDb && Array.isArray(komentarDb.comments)) {
      jumlahKomentar = komentarDb.comments.length;
    }
    totalKomentar += jumlahKomentar;
    detailKomentar.push({
      video_id,
      link: `https://www.tiktok.com/@${client_tiktok}/video/${video_id}`,
      jumlahKomentar,
    });
  }

  // Format laporan mirip IG
  let msg =
    `📊 Rekap Komentar TikTok\n` +
    `Client: ${client_id}\n` +
    `Jumlah konten hari ini: ${posts.length}\n` +
    `Total komentar semua konten: ${totalKomentar}\n\n` +
    `Rincian:\n`;

  detailKomentar.forEach((d) => {
    msg += `${d.link}: ${d.jumlahKomentar} komentar\n`;
  });

  return msg.trim();
}

cron.schedule(
  "18 6-22 * * *",
  async () => {
    console.log(
      "[CRON TIKTOK] Mulai tugas fetch post & absensi komentar AKUMULASI BELUM (ala handler manual)..."
    );
    try {
      const clients = await getActiveClientsTiktok();

      for (const client_id of clients) {
        try {
          const client_tiktok = await getClientTiktokUsername(client_id);

          // === 1. FETCH POST TIKTOK ===
          let posts = [];
          let postsFromApi = [];
          try {
            postsFromApi = await fetchAndStoreTiktokContent(client_id);
          } catch (e) {
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

          // === 2. REKAP KOMENTAR TIKTOK ===
          const rekapKomentarMsg = await rekapKomentarTikTok(client_id, client_tiktok);
          if (rekapKomentarMsg) {
            for (const admin of getAdminWAIds()) {
              try {
                await waClient.sendMessage(admin, rekapKomentarMsg);
              } catch (waErr) {}
            }
          }

          // === 3. ABSENSI KOMENTAR AKUMULASI BELUM ===
          const users = await getUsersByClient(client_id);

          const userStats = {};
          users.forEach((u) => {
            userStats[u.user_id] = { ...u, count: 0 };
          });

          // Loop setiap post dan fetch komentar
          for (const post of posts) {
            const video_id = post.video_id || post.id;
            let commentsArr = [];
            try {
              commentsArr = await fetchAndStoreTiktokComments(video_id);
            } catch (err) {
              const komentarDb = await getCommentsByVideoId(video_id);
              commentsArr = Array.isArray(komentarDb?.comments)
                ? komentarDb.comments
                : [];
            }
            // ALWAYS NORMALIZE array username lowercase (string), baik dari API/object/string/null
            if (commentsArr.length) {
              commentsArr = commentsArr
                .map((c) => {
                  if (typeof c === "string") return c.toLowerCase();
                  if (c && typeof c === "object") {
                    return (c.user?.unique_id || c.username || "")
                      .replace(/^@/, "")
                      .toLowerCase();
                  }
                  return "";
                })
                .filter(Boolean);
            }
            const usernameSet = new Set(commentsArr);

            users.forEach((u) => {
              const tiktokUsername = (u.tiktok || "")
                .replace(/^@/, "")
                .toLowerCase();
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
            if (u.exception) {
              // Selalu dianggap sudah!
              sudah.push(u);
            } else if (
              u.tiktok &&
              u.tiktok.trim() !== "" &&
              u.count >= Math.ceil(totalKonten / 2)
            ) {
              sudah.push(u);
            } else {
              belum.push(u);
            }
          });

          const now = new Date();
          const hari = hariIndo[now.getDay()];
          const tanggal = now.toLocaleDateString("id-ID");
          const jam = now.toLocaleTimeString("id-ID", { hour12: false });

          const kontenLinks = posts.map(
            (p) =>
              `https://www.tiktok.com/@${client_tiktok}/video/${
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

          // === Belum ===
          msg += `❌ Belum melaksanakan (${belum.length} user):\n`;
          const belumDiv = groupByDivision(belum);
          sortDivisionKeys(Object.keys(belumDiv)).forEach((div) => {
            const list = belumDiv[div];
            msg += `*${div}* (${list.length} user):\n`;
            msg +=
              list
                .map(
                  (u) =>
                    `- ${u.title ? u.title + " " : ""}${u.nama} : ${
                      u.tiktok ? u.tiktok : "belum mengisi data tiktok"
                    }`
                )
                .join("\n") + "\n\n";
          });
          if (Object.keys(belumDiv).length === 0) msg += "-\n\n";

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

// ===== END FILE =====
