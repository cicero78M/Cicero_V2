import { pool } from "../config/db.js";
import fetch from "node-fetch";
import { findById, update } from "../model/clientModel.js";
import { saveTiktokPosts, saveTiktokComments } from "../model/tiktokPostModel.js"; // pastikan sesuai

// Mendapatkan secUid dari DB, jika tidak ada ambil dari API, lalu update DB
export async function getTiktokSecUid(client_id) {
  const client = await findById(client_id);
  if (client && client.tiktok_secuid) return client.tiktok_secuid;
  // fallback: ambil via API jika client_tiktok ada
  if (!client || !client.client_tiktok) throw new Error("Username TikTok kosong di database.");
  const username = client.client_tiktok.replace(/^@/, "");
  const url = `https://tiktok-api23.p.rapidapi.com/api/user/info?uniqueId=${encodeURIComponent(username)}`;
  const headers = {
    "x-rapidapi-key": process.env.RAPIDAPI_KEY,
    "x-rapidapi-host": "tiktok-api23.p.rapidapi.com"
  };
  const res = await fetch(url, { headers });
  const data = await res.json();
  const secUid = data?.userInfo?.user?.secUid;
  if (!secUid) throw new Error("Gagal fetch secUid dari API.");
  await update(client_id, { tiktok_secuid: secUid });
  return secUid;
}

// Fetch semua post hari ini berdasarkan secUid dan simpan ke DB
export async function fetchAndStoreTiktokContent(client_id) {
  const secUid = await getTiktokSecUid(client_id);
  // panggil API post TikTok (ganti sesuai endpoint rapidapi-mu)
  const url = `https://tiktok-api23.p.rapidapi.com/api/post/user/aweme?secUid=${encodeURIComponent(secUid)}&count=30`;
  const headers = {
    "x-rapidapi-key": process.env.RAPIDAPI_KEY,
    "x-rapidapi-host": "tiktok-api23.p.rapidapi.com"
  };
  const res = await fetch(url, { headers });
  const data = await res.json();
  // Filter post hari ini
  const today = new Date();
  const isToday = (ts) => {
    const d = new Date(ts * 1000);
    return d.toDateString() === today.toDateString();
  };
  const postsToday = (data?.aweme_list || []).filter(post => isToday(post.create_time));
  // Simpan ke DB (pastikan fungsi saveTiktokPosts tersedia)
  await saveTiktokPosts(client_id, postsToday);
  return postsToday.map(post => ({
    video_id: post.aweme_id,
    desc: post.desc,
    digg_count: post.statistics.digg_count,
    unique_id: post.author?.unique_id || "",
    create_time: post.create_time
  }));
}

// Fetch semua komentar untuk satu video_id (paginasi otomatis, simpan ke DB)
export async function fetchAllTikTokCommentsToday(client_id, video_id) {
  let cursor = 0, allComments = [];
  while (true) {
    const url = `https://tiktok-api23.p.rapidapi.com/api/comment/list?aweme_id=${video_id}&cursor=${cursor}&count=50`;
    const headers = {
      "x-rapidapi-key": process.env.RAPIDAPI_KEY,
      "x-rapidapi-host": "tiktok-api23.p.rapidapi.com"
    };
    const res = await fetch(url, { headers });
    const data = await res.json();
    if (!data.comments || !Array.isArray(data.comments)) break;
    allComments.push(...data.comments);
    if (!data.has_more || !data.cursor || data.comments.length === 0) break;
    cursor = data.cursor;
  }
  // Simpan ke DB (pastikan fungsi saveTiktokComments tersedia)
  await saveTiktokComments(client_id, video_id, allComments);
  return allComments;
}
