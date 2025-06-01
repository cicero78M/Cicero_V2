// src/service/cronService.js

import cron from "node-cron";
import dotenv from "dotenv";
dotenv.config();

import axios from "axios";
import { fetchAndStoreInstaContent } from "./instaFetchService.js";
import { getUsersByClient, getUsersByClientFull } from "../model/userModel.js";
import { getShortcodesTodayByClient } from "../model/instaPostModel.js";
import { getLikesByShortcode } from "../model/instaLikeModel.js";
import { fetchAndAbsensiTiktok } from "./tiktokFetchService.js";
import { normalizeTikTokUsername } from "../utils/tiktokHelper.js";
import { getPostsTodayByClient } from "../model/tiktokPostModel.js";
import * as tiktokCommentModel from '../model/tiktokCommentModel.js';
import { pool } from "../config/db.js";
import waClient from "./waService.js";

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

// ===============================
// === TikTok Multi-page Comment ===
// ===============================

function sleep(ms) { return new Promise(res => setTimeout(res, ms)); }

// Ambil semua komentar satu video (semua halaman)
async function fetchAllCommentsForVideo(videoId, maxPage = 20) {
  let allComments = [];
  let cursor = 0;
  let hasMore = true;
  let page = 0;
  while (hasMore && page < maxPage) {
    try {
      const res = await axios.get(`https://${process.env.RAPIDAPI_HOST}/api/post/comments`, {
        params: { videoId, count: 100, cursor },
        headers: {
          'x-rapidapi-key': process.env.RAPIDAPI_KEY,
          'x-rapidapi-host': process.env.RAPIDAPI_HOST
        }
      });
      const data = res.data;
      const comments = (data.comments || []).map(c => c.user?.unique_id).filter(Boolean);
      allComments.push(...comments);
      hasMore = !!(data.has_more || data.hasMore || data.next_cursor);
      cursor = data.next_cursor || data.cursor || 0;
      if (!hasMore || comments.length === 0) break;
      await sleep(700); // delay antar halaman
      page++;
    } catch (e) {
      console.log(`[ERROR] Fetch komentar video ${videoId}: ${e.message}`);
      break;
    }
  }
  // Remove duplicates
  allComments = Array.from(new Set(allComments));
  return allComments;
}

async function fetchAllTikTokCommentsToday(clients) {
  for (const client of clients) {
    if (!client.client_status || !client.client_tiktok || !client.tiktok_secuid) continue;
    const posts = await getPostsTodayByClient(client.client_id);
    for (const post of posts) {
      const video_id = post.video_id || post.id;
      if (!video_id) continue;
      const comments = await fetchAllCommentsForVideo(video_id);
      await tiktokCommentModel.upsertTiktokComments(video_id, comments);
      console.log(`[${client.client_id}] ${video_id} - ${comments.length} komentar`);
      await sleep(1200); // delay antar video
    }
    await sleep(2000); // delay antar client
  }
  console.log('=== Fetch ALL TikTok Comments Selesai ===');
  return true;
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

// === CRON TIKTOK: Komentar & Absensi (Multi-Page) ===
cron.schedule(
  "2 6-22 * * *",
  async () => {
    console.log(
      "[CRON TIKTOK] Mulai tugas fetchTiktok, fetch komentar multi-page, dan absensi komentar akumulasi belum..."
    );
    let clients;
    try {
      const res = await pool.query(
        `SELECT client_id, client_tiktok, tiktok_secuid, client_status FROM clients WHERE client_status = true AND client_tiktok_status = true AND client_tiktok IS NOT NULL AND client_tiktok <> ''`
      );
      clients = res.rows;
    } catch (err) {
      console.error("[CRON TIKTOK] ERROR ambil daftar client TikTok:", err);
      return;
    }

    // 1. Fetch semua komentar multi-page seluruh video TikTok hari ini
    try {
      await fetchAllTikTokCommentsToday(clients);
    } catch (err) {
      console.error("[CRON TIKTOK] ERROR fetchAllTikTokCommentsToday:", err);
      for (const admin of getAdminWAIds()) {
        try {
          await waClient.sendMessage(admin, `[CRON TIKTOK ERROR] Gagal fetch semua komentar TikTok: ${err.message || err}`);
        } catch {}
      }
    }

    // 2. Proses absensi komentar (setelah komentar sudah terupdate)
    for (const client of clients) {
      try {
        const hasilAbsensi = await fetchAndAbsensiTiktok(client, waClient, null);
        if (!hasilAbsensi) {
          const notif = `[CRON TIKTOK][${client.client_id}] Tidak ada post/komentar TikTok hari ini (API/DB).`;
          console.log(notif);
          for (const admin of getAdminWAIds()) {
            try { await waClient.sendMessage(admin, notif); } catch {}
          }
        }
      } catch (err) {
        const errorMsg = `[CRON TIKTOK][${client.client_id}] ERROR: ${err.message}`;
        console.error(errorMsg);
        for (const admin of getAdminWAIds()) {
          try { await waClient.sendMessage(admin, errorMsg); } catch {}
        }
      }
    }
    console.log("[CRON TIKTOK] Semua client selesai absensi komentar.");
  },
  {
    timezone: "Asia/Jakarta",
  }
);

// ====== END ======
