// src/service/cronService.js

import cron from "node-cron";
import dotenv from "dotenv";
dotenv.config();

import { fetchAndStoreTiktokContent } from "../service/tiktokFetchService.js";
import { fetchAndStoreTiktokComments } from "../service/tiktokCommentService.js";
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

function sendCronDebug(client_id, msg) {
  const adminWA = getAdminWAIds();
  for (const wa of adminWA)
    waClient
      .sendMessage(wa, `[CRON TIKTOK][${client_id}] ${msg}`)
      .catch(() => {});
  console.log(`[CRON TIKTOK][${client_id}] ${msg}`);
}

async function rekapKomentarTikTok(client_id, client_tiktok) {
  const posts = await getPostsTodayByClient(client_id);
  if (!posts.length) return null;

  let totalKomentar = 0;
  let detailKomentar = [];
  for (const post of posts) {
    const video_id = post.video_id || post.id;
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

function formatRekapPostTikTok(client_id, username, posts) {
  let msg = `*Rekap Post TikTok Hari Ini*\nClient: *${client_id}*\n\n`;
  msg += `Jumlah post: *${posts.length}*\n\n`;
  posts.forEach((item, i) => {
    const desc = item.desc || item.caption || "-";
    let create_time =
      item.create_time || item.created_at || item.createTime;
    let created = "-";
    if (typeof create_time === "number") {
      if (create_time > 2000000000) {
        created = new Date(create_time).toLocaleString("id-ID", {
          timeZone: "Asia/Jakarta",
        });
      } else {
        created = new Date(create_time * 1000).toLocaleString("id-ID", {
          timeZone: "Asia/Jakarta",
        });
      }
    } else if (typeof create_time === "string") {
      created = new Date(create_time).toLocaleString("id-ID", {
        timeZone: "Asia/Jakarta",
      });
    } else if (create_time instanceof Date) {
      created = create_time.toLocaleString("id-ID", {
        timeZone: "Asia/Jakarta",
      });
    }
    const video_id = item.video_id || item.id;
    msg += `#${i + 1} Video ID: ${video_id}\n`;
    msg += `   Deskripsi: ${desc.slice(0, 50)}\n`;
    msg += `   Tanggal: ${created}\n`;
    msg += `   Like: ${item.digg_count ?? item.like_count ?? 0} | Komentar: ${item.comment_count ?? 0}\n`;
    msg += `   Link: https://www.tiktok.com/@${username}/video/${video_id}\n\n`;
  });
  return msg.trim();
}

// ========== CRON JOB TIKTOK ==========

cron.schedule(
  "37 6-22 * * *",
  async () => {
    console.log("[CRON TIKTOK] Mulai tugas fetch post, rekap post, & absensi komentar ...");
    try {
      const clients = await getActiveClientsTiktok();

      for (const client_id of clients) {
        try {
          sendCronDebug(client_id, "Memulai proses cron TikTok");

          // === Ambil username TikTok ===
          let client_tiktok = "-";
          try {
            client_tiktok = await getClientTiktokUsername(client_id) || "-";
            sendCronDebug(client_id, `Username TikTok: ${client_tiktok}`);
          } catch (e) {
            sendCronDebug(client_id, `Gagal ambil username TikTok: ${e.message}`);
          }

          // === 1. FETCH POST TIKTOK (API dulu, fallback DB) ===
          let posts;
          try {
            posts = await fetchAndStoreTiktokContent(client_id);
            sendCronDebug(
              client_id,
              `fetchAndStoreTiktokContent OK: ${Array.isArray(posts) ? posts.length : "null"}`
            );
          } catch (e) {
            sendCronDebug(
              client_id,
              `GAGAL API fetchAndStoreTiktokContent: ${e.stack || e.message}`
            );
            posts = undefined;
          }

          if (!posts || !Array.isArray(posts) || posts.length === 0) {
            try {
              posts = await getPostsTodayByClient(client_id);
              sendCronDebug(
                client_id,
                `Fallback getPostsTodayByClient OK: ${Array.isArray(posts) ? posts.length : "null"}`
              );
              if (posts && posts.length > 0) {
                await waClient
                  .sendMessage(
                    getAdminWAIds()[0],
                    `[CRON TIKTOK][${client_id}] ⚠️ Tidak ada post TikTok hari ini dari API, menggunakan data dari database...`
                  )
                  .catch(() => {});
              }
            } catch (dbErr) {
              sendCronDebug(
                client_id,
                `GAGAL Query DB TikTok: ${dbErr.stack || dbErr.message}`
              );
              posts = undefined;
            }
          }

          if (!posts || posts.length === 0) {
            sendCronDebug(
              client_id,
              `Tidak ada post ditemukan di API maupun database`
            );
            for (const admin of getAdminWAIds()) {
              await waClient
                .sendMessage(
                  admin,
                  `[CRON TIKTOK][${client_id}] ❌ Tidak ada post TikTok hari ini (API & DB kosong)`
                )
                .catch(() => {});
            }
            continue;
          }

          // === Rekap post TikTok
          if (posts && posts.length > 0) {
            try {
              const rekapPostMsg = formatRekapPostTikTok(
                client_id,
                client_tiktok,
                posts
              );
              for (const admin of getAdminWAIds()) {
                await waClient.sendMessage(admin, rekapPostMsg).catch(() => {});
              }
              sendCronDebug(client_id, "Laporan post TikTok dikirim ke admin");
            } catch (waErr) {
              sendCronDebug(
                client_id,
                "GAGAL kirim laporan post TikTok ke admin: " + waErr.message
              );
            }
          }

          // === Rekap komentar TikTok
          try {
            const rekapKomentarMsg = await rekapKomentarTikTok(
              client_id,
              client_tiktok
            );
            if (rekapKomentarMsg) {
              for (const admin of getAdminWAIds()) {
                await waClient.sendMessage(admin, rekapKomentarMsg).catch(() => {});
              }
              sendCronDebug(client_id, "Laporan komentar TikTok dikirim ke admin");
            }
          } catch (e) {
            sendCronDebug(
              client_id,
              "GAGAL rekap komentar: " + (e.stack || e.message)
            );
          }

          // === Absensi komentar akumulasi belum ===
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
              sudah.push(u); // Selalu dianggap sudah!
            } else if (
              u.tiktok &&
              u.tiktok.trim() !== "" &&
              u.count >= Math.ceil(totalKonten / 2)
            ) {
              sudah.push(u);
            } else if (!u.exception) {
              belum.push(u); // Pastikan exception tidak pernah masuk ke "belum"
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
            `*Daftar link video hari ini:*\n${kontenLinks.join("\n")}\n\n`;

          const totalUser = users.length;
          const jumlahSudah = sudah.length;
          const jumlahBelum = belum.length;
          const persenPelaksanaan =
            totalUser > 0
              ? Math.round((jumlahSudah / totalUser) * 100)
              : 0;

          msg +=
            `*Jumlah user:* ${totalUser}\n` +
            `✅ Sudah melaksanakan: *${jumlahSudah}*\n` +
            `❌ Belum melaksanakan: *${jumlahBelum}*\n` +
            `\n*Jumlah pelaksanaan: ${jumlahSudah} dari ${totalUser} user (${persenPelaksanaan}%)*\n\n`;

          msg += `❌ Belum melaksanakan (${belum.length} user):\n`;
          const belumDiv = groupByDivision(belum);
          sortDivisionKeys(Object.keys(belumDiv)).forEach((div) => {
            const list = belumDiv[div];
            msg += `*${div}* (${list.length} user):\n`;
            msg +=
              list
                .map((u) => {
                  let ket = "";
                  if (!u.count || u.count === 0) {
                    ket = "sudah melaksanakan 0";
                  } else if (
                    u.count > 0 &&
                    u.count < Math.ceil(totalKonten / 2)
                  ) {
                    ket = `sudah melaksanakan ${u.count} dari ${totalKonten} konten`;
                  }
                  return (
                    `- ${u.title ? u.title + " " : ""}${u.nama} : ` +
                    `${u.tiktok ? u.tiktok : "belum mengisi data tiktok"}` +
                    (ket ? ` (${ket})` : "")
                  );
                })
                .join("\n") + "\n\n";
          });
          if (Object.keys(belumDiv).length === 0) msg += "-\n\n";

          msg += `\nTerimakasih.`;

          for (const admin of getAdminWAIds()) {
            await waClient.sendMessage(admin, msg.trim()).catch(() => {});
          }
          sendCronDebug(client_id, "Absensi komentar TikTok (akumulasi belum) dikirim ke admin");
        } catch (err) {
          sendCronDebug(client_id, "ERROR CATCH FINAL: " + (err.stack || err.message));
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
