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

const hariIndo = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const ADMIN_WHATSAPP = (process.env.ADMIN_WHATSAPP || "")
  .split(",")
  .map((n) => n.trim())
  .filter(Boolean);

function getAdminWAIds() {
  return ADMIN_WHATSAPP.map((n) =>
    n.endsWith("@c.us") ? n : n.replace(/\D/g, "") + "@c.us"
  );
}

// ===== TikTok Command-based Execution =====

export async function handleCommandTiktok(text, chatId) {
  if (!text) return;

  const lower = text.toLowerCase().trim();
  if (lower.startsWith("fetchtiktok#")) {
    const parts = lower.split("#");
    const client_id = parts[1] || "";
    if (!client_id) {
      await waClient.sendMessage(chatId, "Format salah. Contoh: fetchtiktok#clientid");
      return;
    }
    await handleFetchTiktok(client_id, chatId);
  } else if (lower.startsWith("absensikomentar#")) {
    const parts = lower.split("#");
    const client_id = parts[1] || "";
    const type = (parts[2] || "").toLowerCase();
    const subtype = (parts[3] || "").toLowerCase();
    if (!client_id || type !== "akumulasi" || subtype !== "belum") {
      await waClient.sendMessage(chatId, "Format salah. Contoh: absensikomentar#clientid#akumulasi#belum");
      return;
    }
    await handleAbsensiKomentarTiktok(client_id, chatId);
  }
}

async function handleFetchTiktok(client_id, chatId) {
  try {
    const posts = await fetchAndStoreTiktokContent(client_id);
    const msg = posts.length
      ? `✅ Berhasil fetch ${posts.length} post TikTok hari ini untuk client ${client_id}`
      : `⚠️ Tidak ditemukan post TikTok hari ini untuk client ${client_id}`;
    await waClient.sendMessage(chatId, msg);
  } catch (e) {
    await waClient.sendMessage(chatId, `❌ Gagal fetch TikTok: ${e.message}`);
  }
}

async function handleAbsensiKomentarTiktok(client_id, chatId) {
  try {
    let posts = await getPostsTodayByClient(client_id);
    if (!posts || posts.length === 0) {
      await waClient.sendMessage(chatId, `⚠️ Tidak ada data post TikTok hari ini untuk ${client_id}`);
      return;
    }
    for (const post of posts) {
      const video_id = post.video_id || post.id;
      try {
        await fetchAndStoreTiktokComments(video_id);
      } catch {}
    }
    await absensiKomentarTiktok(client_id, posts, chatId);
  } catch (e) {
    await waClient.sendMessage(chatId, `❌ Gagal absensi komentar: ${e.message}`);
  }
}

async function absensiKomentarTiktok(client_id, posts, chatId) {
  const users = await getUsersByClient(client_id);
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
    const sudahPerSatfung = {}, belumPerSatfung = {};
    let totalSudah = 0, totalBelum = 0;

    users.forEach((u) => {
      const satfung = u.divisi || "-";
      const nama = [u.title, u.nama].filter(Boolean).join(" ");
      const tiktokUsername = (u.tiktok || "").replace(/^@/, "");
      if (u.tiktok && usernameSet.has(tiktokUsername.toLowerCase())) {
        (sudahPerSatfung[satfung] ||= []).push(`${nama} : ${u.tiktok}`);
        totalSudah++;
      } else {
        const label = u.tiktok ? `${nama} : ${u.tiktok}` : `${nama} : belum mengisi data tiktok`;
        (belumPerSatfung[satfung] ||= []).push(label);
        totalBelum++;
      }
    });

    let msg = headerLaporan +
      `📋 Absensi Komentar TikTok\n*Polres*: *${client_id}*\n${hari}, ${tanggal}\nJam: ${jam}\n` +
      `*Video ID:* ${video_id}\n*Jumlah user:* ${users.length}\n` +
      `✅ Sudah melaksanakan: *${totalSudah}*\n❌ Belum melaksanakan: *${totalBelum}*\n\n`;

    for (const [div, arr] of Object.entries(sudahPerSatfung)) {
      msg += `*${div}* (${arr.length} user):\n` + arr.map(a => `- ${a}`).join("\n") + "\n";
    }
    msg += `\n❌ Belum melaksanakan (${totalBelum} user):\n`;
    for (const [div, arr] of Object.entries(belumPerSatfung)) {
      msg += `*${div}* (${arr.length} user):\n` + arr.map(a => `- ${a}`).join("\n") + "\n";
    }

    await waClient.sendMessage(chatId, msg.trim()).catch(() => {});
  }
}
