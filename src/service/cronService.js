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

// TikTok
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

// ===== IG CRON - Absensi Likes (exception selalu sudah) =====

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
    return `Tidak ada konten IG untuk *Polres*: *${client_id}* hari ini.`;

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
    if (u.exception) {
      sudah.push(u); // selalu masuk sudah
    } else if (
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
    `📋 Rekap Akumulasi Likes IG\n*Polres*: *${client_id}*\n${hari}, ${tanggal}\nJam: ${jam}\n` +
    `*Jumlah Konten:* ${totalKonten}\n` +
    `*Daftar Link Konten:*\n${kontenLinks.join("\n")}\n\n` +
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
              u.insta ? u.insta : "belum mengisi data insta"
            }`
        )
        .join("\n") + "\n\n";
  });
  if (Object.keys(belumDiv).length === 0) msg += "-\n\n";

  // === Sudah ===
  msg += `✅ Sudah melaksanakan (${sudah.length} user):\n`;
  const sudahDiv = groupByDivision(sudah);
  sortDivisionKeys(Object.keys(sudahDiv)).forEach((div) => {
    const list = sudahDiv[div];
    msg += `*${div}* (${list.length} user):\n`;
    msg +=
      list
        .map(
          (u) =>
            `- ${u.title ? u.title + " " : ""}${u.nama} : ${u.insta} (${
              u.count
            } konten)`
        )
        .join("\n") + "\n\n";
  });
  if (Object.keys(sudahDiv).length === 0) msg += "-\n";

  msg += `\nTerimakasih.`;

  return msg.trim();
}

// ===== TIKTOK CRON - Absensi Komentar (exception selalu sudah) =====

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

async function absensiKomentarAkumulasiBelum(client_id, client_tiktok) {
  const now = new Date();
  const hari = hariIndo[now.getDay()];
  const tanggal = now.toLocaleDateString("id-ID");
  const jam = now.toLocaleTimeString("id-ID", { hour12: false });

  const users = await getUsersByClient(client_id);
  const posts = await getPostsTodayByClient(client_id);

  // Persiapkan statistik komentar per user
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
    // Normalize array username lowercase
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
      sudah.push(u); // selalu masuk sudah
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

  const kontenLinks = posts.map(
    (p) =>
      `https://www.tiktok.com/@${client_tiktok}/video/${p.video_id || p.id}`
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

  // === Sudah ===
  msg += `✅ Sudah melaksanakan (${sudah.length} user):\n`;
  const sudahDiv = groupByDivision(sudah);
  sortDivisionKeys(Object.keys(sudahDiv)).forEach((div) => {
    const list = sudahDiv[div];
    msg += `*${div}* (${list.length} user):\n`;
    msg +=
      list
        .map(
          (u) =>
            `- ${u.title ? u.title + " " : ""}${u.nama} : ${u.tiktok} (${
              u.count
            } video)`
        )
        .join("\n") + "\n\n";
  });
  if (Object.keys(sudahDiv).length === 0) msg += "-\n";

  msg += `\nTerimakasih.`;

  return msg.trim();
}

// ========== CRON IG: Likes ==========
cron.schedule(
  "20 6-22 * * *",
  async () => {
    try {
      const clients = await getActiveClientsIG();
      await fetchAndStoreInstaContent([
        "code",
        "caption",
        "like_count",
        "taken_at",
        "comment_count",
      ]);
      for (const client of clients) {
        const msg = await absensiLikesAkumulasiBelum(client.client_id);
        if (msg && msg.length > 0) {
          for (const admin of getAdminWAIds()) {
            try {
              await waClient.sendMessage(admin, msg);
            } catch (waErr) {
              // abaikan
            }
          }
        }
      }
    } catch (err) {
      for (const admin of getAdminWAIds()) {
        try {
          await waClient.sendMessage(
            admin,
            `[CRON IG ERROR] ${err.message || err}`
          );
        } catch (waErr) {}
      }
    }
  },
  {
    timezone: "Asia/Jakarta",
  }
);

// ========== CRON TIKTOK: Komentar ==========
cron.schedule(
  "21 6-22 * * *",
  async () => {
    try {
      const clients = await getActiveClientsTiktok();
      for (const client_id of clients) {
        const client_tiktok = await getClientTiktokUsername(client_id);
        await fetchAndStoreTiktokContent(client_id);
        const msg = await absensiKomentarAkumulasiBelum(client_id, client_tiktok);
        if (msg && msg.length > 0) {
          for (const admin of getAdminWAIds()) {
            try {
              await waClient.sendMessage(admin, msg);
            } catch (waErr) {
              // abaikan
            }
          }
        }
      }
    } catch (err) {
      for (const admin of getAdminWAIds()) {
        try {
          await waClient.sendMessage(
            admin,
            `[CRON TIKTOK ERROR] ${err.message || err}`
          );
        } catch (waErr) {}
      }
    }
  },
  {
    timezone: "Asia/Jakarta",
  }
);

// ===== END =====
