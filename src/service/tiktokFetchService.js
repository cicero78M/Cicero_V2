import axios from "axios";
import { findById, update } from "../model/clientModel.js";
import { upsertTiktokPosts } from "../model/tiktokPostModel.js";
import waClient from "./waService.js";
import dotenv from "dotenv";
dotenv.config();

// Helper: Kirim log/debug ke ADMIN WhatsApp
function sendAdminDebug(msg) {
  const adminWA = (process.env.ADMIN_WHATSAPP || "")
    .split(",")
    .map((n) => n.trim())
    .filter(Boolean)
    .map((n) => (n.endsWith("@c.us") ? n : n.replace(/\D/g, "") + "@c.us"));
  for (const wa of adminWA) {
    waClient.sendMessage(wa, `[CICERO DEBUG]\n${msg}`).catch(() => {});
  }
}

export async function getTiktokSecUid(client_id) {
  const client = await findById(client_id);
  if (client && client.tiktok_secuid) return client.tiktok_secuid;
  if (!client || !client.client_tiktok) throw new Error("Username TikTok kosong di database.");
  const username = client.client_tiktok.replace(/^@/, "");
  const url = `https://tiktok-api23.p.rapidapi.com/api/user/info?uniqueId=${encodeURIComponent(username)}`;
  const headers = {
    "x-rapidapi-key": process.env.RAPIDAPI_KEY,
    "x-rapidapi-host": "tiktok-api23.p.rapidapi.com"
  };
  const response = await axios.get(url, { headers });
  const data = response.data;
  const secUid = data?.userInfo?.user?.secUid;
  if (!secUid) throw new Error("Gagal fetch secUid dari API.");
  await update(client_id, { tiktok_secuid: secUid });
  return secUid;
}

// PATCH FINAL
export async function fetchAndStoreTiktokContent(client_id) {
  const secUid = await getTiktokSecUid(client_id);
  const url = `https://tiktok-api23.p.rapidapi.com/api/user/posts`;
  const params = {
    secUid: secUid,
    count: 35,
    cursor: 0
  };
  const headers = {
    "x-rapidapi-key": process.env.RAPIDAPI_KEY,
    "x-rapidapi-host": "tiktok-api23.p.rapidapi.com"
  };

  const response = await axios.get(url, { headers, params });
  let data = response.data;
  if (typeof data === "string") {
    try { data = JSON.parse(data); } catch { data = {}; }
  }
  // --- PATCH: Periksa path data.itemList sesuai file asli
  const postsArr = Array.isArray(data?.data?.itemList) ? data.data.itemList : [];
  sendAdminDebug(`[DEBUG] TikTok POST COUNT (data.itemList): ${postsArr.length}`);

  // Filter post hari ini (Asia/Jakarta)
  const todayJakarta = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" }));
  function isTodayJakarta(ts) {
    const d = new Date(new Date(ts * 1000).toLocaleString("en-US", { timeZone: "Asia/Jakarta" }));
    return d.getFullYear() === todayJakarta.getFullYear() &&
           d.getMonth() === todayJakarta.getMonth() &&
           d.getDate() === todayJakarta.getDate();
  }
  const postsToday = postsArr.filter(post => isTodayJakarta(post.createTime));

  sendAdminDebug(`[DEBUG] fetchAndStoreTiktokContent: jumlah post hari ini=${postsToday.length}`);

  // --- Simpan ke DB jika ada
  if (postsToday.length > 0) {
    await upsertTiktokPosts(client_id, postsToday.map(post => ({
      video_id: post.id || post.video_id,
      desc: post.desc || "",
      create_time: post.createTime, // unix detik
      digg_count: post.stats?.diggCount ?? 0,
      comment_count: post.stats?.commentCount ?? 0,
    })));
    sendAdminDebug(`[DEBUG] fetchAndStoreTiktokContent: sudah simpan ${postsToday.length} post ke DB`);
  } else {
    sendAdminDebug(`[DEBUG] fetchAndStoreTiktokContent: tidak ada post hari ini untuk ${client_id}`);
  }
  return postsToday.map(post => ({
    video_id: post.id || post.video_id,
    desc: post.desc || "",
    create_time: post.createTime,
    digg_count: post.stats?.diggCount ?? 0,
    comment_count: post.stats?.commentCount ?? 0,
  }));
}
