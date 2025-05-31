// src/service/cronService.js

import cron from "node-cron";
import dotenv from "dotenv";
dotenv.config();

// === CRON IG ===
import { fetchAndStoreInstaContent } from "./instaFetchService.js";
import { getUsersByClient } from "../model/userModel.js";
import { getShortcodesTodayByClient } from "../model/instaPostModel.js";
import { getLikesByShortcode } from "../model/instaLikeModel.js";

// === CRON TIKTOK ===
import {
  fetchAndStoreTiktokContent,
  fetchCommentsTodayByClient,
} from "./tiktokFetchService.js";
import { getPostsTodayByClient } from "../model/tiktokPostModel.js";
import { getUsersByClientFull } from "../model/userModel.js";
import { getCommentsByVideoId } from "../model/tiktokCommentModel.js";
import { fetchTiktokCommentsByVideoId } from "./tiktokCommentFetchService.js";

import { pool } from "../config/db.js";
import waClient from "./waService.js";

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

// Helper ambil username dari post TikTok
function getTiktokUsernameFromPost(post) {
  // post bisa berupa object (hasil fetch) atau string id dari DB
  // pastikan post.tiktok_username atau jika tidak ada fallback ke client_id/-
  if (!post) return "-";
  if (typeof post === "object") {
    return post.tiktok_username || post.username || "-";
  }
  return "-";
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
  let sudah = [],
    belum = [];
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

  // Sudah
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
  // Belum
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

// === TIKTOK CRON: Absensi Komentar Akumulasi Belum ===
async function getActiveClientsTiktok() {
  const res = await pool.query(
    `SELECT client_id, client_tiktok FROM clients WHERE client_status = true AND client_tiktok_status = true AND client_tiktok IS NOT NULL`
  );
  return res.rows;
}
function normalizeTikTokUsername(val) {
  if (!val) return "";
  if (val.startsWith("http")) {
    // Ambil dari url: https://www.tiktok.com/@username
    const match = val.match(/tiktok\.com\/@([a-zA-Z0-9._]+)/i);
    return match ? match[1].toLowerCase() : "";
  }
  return val.replace(/^@/, "").trim().toLowerCase();
}

async function absensiKomentarAkumulasiBelum(client_id) {
  const now = new Date();
  const hari = hariIndo[now.getDay()];
  const tanggal = now.toLocaleDateString("id-ID");
  const jam = now.toLocaleTimeString("id-ID", { hour12: false });

  const users = await getUsersByClientFull(client_id);
  const postsToday = await getPostsTodayByClient(client_id);

  // Patch: Tetap lakukan absensi walau postsToday kosong, informasikan ke log/admin
  if (!postsToday.length) {
    console.log(
      `[CRON TIKTOK] Tidak ada post TikTok hari ini untuk client_id=${client_id}. Akan lakukan absensi berdasar data DB bila ada.`
    );
    return `Tidak ada konten TikTok untuk *Client*: *${client_id}* hari ini.`;
  }

  const userStats = {};
  users.forEach((u) => {
    userStats[u.user_id] = { ...u, count: 0 };
  });

  for (const postId of postsToday) {
    const comments = await getCommentsByVideoId(postId);
    const commentsSet = new Set(
      (comments || []).map((x) => normalizeTikTokUsername(x))
    );
    users.forEach((u) => {
      const uname = normalizeTikTokUsername(u.tiktok);
      if (uname && commentsSet.has(uname)) {
        userStats[u.user_id].count += 1;
      }
    });
  }

  const totalKonten = postsToday.length;
  let sudah = [],
    belum = [];
  Object.values(userStats).forEach((u) => {
    const uname = normalizeTikTokUsername(u.tiktok);
    if (uname && u.count >= Math.ceil(totalKonten / 2)) {
      sudah.push(u);
    } else {
      belum.push(u);
    }
  });

  const kontenLinks = postsToday.map(
    (id) => `https://www.tiktok.com/video/${id}`
  );

  let msg =
    `Mohon Ijin Komandan,\n\nMelaporkan Rekap Pelaksanaan Komentar pada Akun Official TikTok :\n\n` +
    `📋 Rekap Akumulasi Komentar TikTok\n*Client*: *${client_id}*\n${hari}, ${tanggal}\nJam: ${jam}\n` +
    `Jumlah Konten: ${totalKonten}\nDaftar Link Konten:\n${kontenLinks.join(
      "\n"
    )}\n\n` +
    `Jumlah user: *${users.length}*\n✅ Sudah melaksanakan: *${sudah.length}*\n❌ Belum melaksanakan: *${belum.length}*\n\n`;

  // Sudah
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
  // Belum
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
                !normalizeTikTokUsername(u.tiktok)
                  ? " (belum mengisi data tiktok)"
                  : ""
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
  // Format pesan rekap
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
  "51 6-22 * * *",
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

      // PATCH: Buat summary hasil fetch, kirim ke WA admin
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

// === Rekap Komentar TikTok per Client ===
async function rekapKomentarTiktok(client_id, postsTodayParam) {
  let postsToday = postsTodayParam;
  if (!Array.isArray(postsToday) || !postsToday.length) {
    postsToday = await getPostsTodayByClient(client_id);
  }
  if (!postsToday.length) return null;

  let totalKomentar = 0;
  let detailKomentar = [];
  for (const post of postsToday) {
    let videoId, username;
    videoId =
      typeof post === "object"
        ? post.id || post.video_id || post.aweme_id || post.post_id
        : post;
    username = getTiktokUsernameFromPost(post);

    const comments = await getCommentsByVideoId(videoId);
    const jumlahKomentar = (comments || []).length;
    totalKomentar += jumlahKomentar;
    detailKomentar.push({
      id: videoId,
      username,
      link: formatTiktokVideoLink(username, videoId),
      jumlahKomentar,
    });
  }
  let msg =
    `📊 Rekap Komentar TikTok\n*Client*: *${client_id}*\n` +
    `Jumlah konten hari ini: *${postsToday.length}*\n` +
    `Total komentar semua konten: *${totalKomentar}*\n\n` +
    `Rincian:\n`;
  detailKomentar.forEach((d) => {
    msg += `- ${d.link}: ${d.jumlahKomentar} komentar\n`;
  });
  return msg.trim();
}

// Rekap Post TikTok per Client (hasil fetch API)
function formatTiktokVideoLink(username, id) {
  // Format: https://tiktok.com/@username/video/id
  if (!username || username === "-") return `https://tiktok.com/video/${id}`;
  return `https://tiktok.com/@${username}/video/${id}`;
}

async function rekapPostTiktok(client_id, postsToday) {
  if (!Array.isArray(postsToday) || !postsToday.length) return null;
  let msg =
    `📊 Rekap Post TikTok\n*Client*: *${client_id}*\n` +
    `Jumlah post hari ini: *${postsToday.length}*\n` +
    `Daftar Link Konten:\n`;

  postsToday.forEach((post) => {
    // post bisa object (dari fetch API) atau string id (dari DB)
    let videoId, username;
    videoId =
      typeof post === "object"
        ? post.id || post.video_id || post.aweme_id || post.post_id
        : post;
    username = getTiktokUsernameFromPost(post);

    msg += `${formatTiktokVideoLink(username, videoId)}\n`;
  });
  return msg.trim();
}

// === CRON TikTok: Komentar ===
cron.schedule(
  "10 6-22 * * *",
  async () => {
    console.log(
      "[CRON TIKTOK] Mulai tugas fetchTiktok & absensiKomentar akumulasi belum..."
    );
    try {
      const clients = await getActiveClientsTiktok();
      // Step 1: Fetch konten TikTok terbaru (API)
      const fetchResult = await fetchAndStoreTiktokContent();
      let fetchMsg =
        `[CRON TIKTOK] Hasil fetch TikTok:\n` +
        `Tanggal: ${new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}\n`;

      if (fetchResult && typeof fetchResult === "object") {
        Object.entries(fetchResult).forEach(([clientId, stat]) => {
          fetchMsg += `Client: ${clientId}\n  - Jumlah post hari ini: ${stat.count || 0}\n`;
          if (stat.error) fetchMsg += `  - Error: ${stat.error}\n`;
        });
      } else {
        fetchMsg += 'Fetch selesai (tidak ada summary detail).';
      }
      // Send summary to admin
      for (const admin of getAdminWAIds()) {
        try {
          await waClient.sendMessage(admin, fetchMsg);
        } catch (e) {}
      }
      console.log(fetchMsg);

      for (const client of clients) {
        let postsToday = null;

        // Step 2: Ambil post dari API result (atau fallback DB)
        if (
          fetchResult &&
          typeof fetchResult === "object" &&
          fetchResult[client.client_id] &&
          Array.isArray(fetchResult[client.client_id].postsToday) &&
          fetchResult[client.client_id].postsToday.length > 0
        ) {
          postsToday = fetchResult[client.client_id].postsToday;
        } else {
          postsToday = await getPostsTodayByClient(client.client_id);
        }

        if (Array.isArray(postsToday) && postsToday.length > 0) {
          // === [BARU] Fetch komentar API semua post, simpan ke DB (sebelum rekap/absensi)
          for (const post of postsToday) {
            const videoId =
              typeof post === "object"
                ? post.id || post.video_id || post.aweme_id || post.post_id
                : post;
            await fetchTiktokCommentsByVideoId(videoId);
          }

          // === Rekap POST TikTok (jika dari API)
          if (
            fetchResult &&
            fetchResult[client.client_id] &&
            Array.isArray(fetchResult[client.client_id].postsToday) &&
            fetchResult[client.client_id].postsToday.length > 0
          ) {
            const rekapPostMsg = await rekapPostTiktok(client.client_id, postsToday);
            if (rekapPostMsg) {
              for (const admin of getAdminWAIds()) {
                try { await waClient.sendMessage(admin, rekapPostMsg); } catch (waErr) {}
              }
            }
          }

          // === Rekap Komentar TikTok (dari DB yang sudah update)
          const rekapMsg = await rekapKomentarTiktok(client.client_id, postsToday);
          if (rekapMsg) {
            for (const admin of getAdminWAIds()) {
              try { await waClient.sendMessage(admin, rekapMsg); } catch (waErr) {}
            }
          }
          // === Absensi Komentar TikTok (dari DB yang sudah update)
          let msg = await absensiKomentarAkumulasiBelum(client.client_id);
          if (msg && msg.length > 0) {
            for (const admin of getAdminWAIds()) {
              try { await waClient.sendMessage(admin, msg); } catch (waErr) {}
            }
          }
        } else {
          // Benar-benar tidak ada post TikTok
          const notif = `[CRON TIKTOK][${client.client_id}] Tidak ada post TikTok sama sekali untuk client ini hari ini (baik API/DB).`;
          console.log(notif);
          for (const admin of getAdminWAIds()) {
            try { await waClient.sendMessage(admin, notif); } catch (waErr) {}
          }
        }

        // === (Opsional) Update komentar ke DB & log summary ===
        try {
          const commentRes = await fetchCommentsTodayByClient(client.client_id);
          const debugMsg =
            `[CRON TIKTOK][${client.client_id}] Update komentar hari ini:\n` +
            `- Jumlah post hari ini: ${commentRes.total}\n` +
            `- Komentar berhasil diambil: ${commentRes.totalFetched}\n` +
            `- Komentar gagal diambil: ${commentRes.failed}\n` +
            `Waktu: ${new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}`;
          console.log(debugMsg);
          for (const admin of getAdminWAIds()) {
            try { await waClient.sendMessage(admin, debugMsg); } catch (waErr) {}
          }
        } catch (e) {
          const errorMsg = `[CRON TIKTOK][${client.client_id}] Gagal fetch komentar hari ini: ${e.message}`;
          console.warn(errorMsg);
          for (const admin of getAdminWAIds()) {
            try { await waClient.sendMessage(admin, errorMsg); } catch (waErr) {}
          }
        }
      }
      console.log("[CRON TIKTOK] Laporan absensi & rekap TikTok berhasil dikirim ke admin.");
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
