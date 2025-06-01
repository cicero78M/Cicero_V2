// src/service/tiktokFetchService.js

import axios from "axios";
import { findById, update } from "../model/clientModel.js";
import { upsertTiktokPosts } from "../model/tiktokPostModel.js";
import { saveTiktokComments } from "../model/tiktokCommentModel.js";
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
  if (client && client.tiktok_secuid) {
    const msg = `[DEBUG] getTiktokSecUid: pakai secUid dari DB untuk ${client_id}: ${client.tiktok_secuid}`;
    console.log(msg);
    sendAdminDebug(msg);
    return client.tiktok_secuid;
  }
  if (!client || !client.client_tiktok) throw new Error("Username TikTok kosong di database.");
  const username = client.client_tiktok.replace(/^@/, "");
  const url = `https://tiktok-api23.p.rapidapi.com/api/user/info?uniqueId=${encodeURIComponent(username)}`;
  const headers = {
    "x-rapidapi-key": process.env.RAPIDAPI_KEY,
    "x-rapidapi-host": "tiktok-api23.p.rapidapi.com"
  };
  const msg1 = `[DEBUG] getTiktokSecUid: fetch secUid dari API untuk ${client_id} / username=${username}`;
  console.log(msg1);
  sendAdminDebug(msg1);

  const response = await axios.get(url, { headers });
  const data = response.data;
  const secUid = data?.userInfo?.user?.secUid;
  if (!secUid) {
    const msgErr = `[ERROR] Gagal fetch secUid dari API untuk ${client_id} / username=${username} -- PAYLOAD: ${JSON.stringify(data)}`;
    console.error(msgErr);
    sendAdminDebug(msgErr);
    throw new Error("Gagal fetch secUid dari API.");
  }
  await update(client_id, { tiktok_secuid: secUid });
  const msg2 = `[DEBUG] getTiktokSecUid: secUid hasil API ${secUid} (sudah diupdate ke DB)`;
  console.log(msg2);
  sendAdminDebug(msg2);
  return secUid;
}

// PATCHED: Fetch semua post hari ini berdasarkan secUid dan simpan ke DB, debug tanggal konten
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

  const msg0 = `[DEBUG] fetchAndStoreTiktokContent: fetch post TikTok secUid=${secUid} client_id=${client_id}`;
  console.log(msg0);
  sendAdminDebug(msg0);

  const response = await axios.get(url, { headers, params });
  const data = response.data;

  // Debug all root keys
  const allKeys = Object.keys(data).join(', ');
  sendAdminDebug(`[DEBUG] TikTok PAYLOAD ROOT KEYS: ${allKeys}`);
  sendAdminDebug(`[DEBUG] TikTok PAYLOAD data KEYS: ${Object.keys(data.data||{}).join(', ')}`);

  // Ambil array post dari data.itemList (BUKAN root!)
  const postsArr = Array.isArray(data?.data?.itemList) ? data.data.itemList : [];
  sendAdminDebug(`[DEBUG] TikTok POST FIELD USED: data.itemList (length=${postsArr.length})`);

  // --- DEBUG: Listkan semua konten, tanggal, dan hasil cek isToday ---
  const todayJakarta = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" }));
  sendAdminDebug(`[DEBUG] Tanggal sistem Asia/Jakarta: ${todayJakarta.toISOString()}`);
  for (const post of postsArr) {
    const ts = post.createTime || post.create_time;
    const kontenDate = new Date(new Date(ts * 1000).toLocaleString("en-US", { timeZone: "Asia/Jakarta" }));
    const isToday = kontenDate.getFullYear() === todayJakarta.getFullYear()
      && kontenDate.getMonth() === todayJakarta.getMonth()
      && kontenDate.getDate() === todayJakarta.getDate();
    const detail = [
      `video_id=${post.id}`,
      `createTime=${ts} (${kontenDate.toISOString()})`,
      `isTodayJakarta=${isToday}`
    ].join(" | ");
    sendAdminDebug(`[DEBUG][itemList] ${detail}`);
  }

  // --- Gunakan filter hari ini persis seperti di atas ---
  function isTodayJakarta(ts) {
    const d = new Date(new Date(ts * 1000).toLocaleString("en-US", { timeZone: "Asia/Jakarta" }));
    return d.getFullYear() === todayJakarta.getFullYear() &&
           d.getMonth() === todayJakarta.getMonth() &&
           d.getDate() === todayJakarta.getDate();
  }
  const postsToday = postsArr.filter(post => isTodayJakarta(post.createTime));

  const msg1 = `[DEBUG] fetchAndStoreTiktokContent: jumlah post hari ini=${postsToday.length}`;
  console.log(msg1); sendAdminDebug(msg1);

  if (postsToday.length > 0) {
    await upsertTiktokPosts(client_id, postsToday.map(post => ({
      video_id: post.id,
      desc: post.desc,
      digg_count: post.statistics?.diggCount ?? 0,
      comment_count: post.statistics?.commentCount ?? 0,
      create_time: post.createTime,
    })));
    const msg2 = `[DEBUG] fetchAndStoreTiktokContent: sudah simpan ${postsToday.length} post ke DB`;
    console.log(msg2); sendAdminDebug(msg2);
  } else {
    const msg3 = `[DEBUG] fetchAndStoreTiktokContent: tidak ada post hari ini untuk ${client_id}`;
    console.log(msg3); sendAdminDebug(msg3);
  }
  return postsToday.map(post => ({
    video_id: post.id,
    desc: post.desc,
    digg_count: post.statistics?.diggCount ?? 0,
    comment_count: post.statistics?.commentCount ?? 0,
    create_time: post.createTime,
  }));
}



// Fetch semua komentar untuk satu video_id (paginasi otomatis, simpan ke DB)
export async function fetchAllTikTokCommentsToday(client_id, video_id) {
  try {
    let cursor = 0, allComments = [];
    let page = 1;
    while (true) {
      const options = {
        method: 'GET',
        url: 'https://tiktok-api23.p.rapidapi.com/api/post/comments',
        params: {
          videoId: video_id,
          count: '50',
          cursor: String(cursor)
        },
        headers: {
          'x-rapidapi-key': process.env.RAPIDAPI_KEY,
          'x-rapidapi-host': 'tiktok-api23.p.rapidapi.com',
          'Content-Type': 'application/json'
        }
      };

      const msg1 = `[DEBUG] fetchAllTikTokCommentsToday: fetch komentar page=${page} video_id=${video_id} cursor=${cursor}`;
      console.log(msg1);
      sendAdminDebug(msg1);

      const response = await axios.request(options);
      const data = response.data;

      if (!data.comments || !Array.isArray(data.comments)) {
        const msgNoData = `[DEBUG] fetchAllTikTokCommentsToday: tidak ada data.comments page=${page}`;
        console.log(msgNoData);
        sendAdminDebug(msgNoData);
        break;
      }
      allComments.push(...data.comments);

      if (!data.has_more || !data.next_cursor || data.comments.length === 0) {
        const msgFinish = `[DEBUG] fetchAllTikTokCommentsToday: selesai (no more/empty) page=${page}, total komentar=${allComments.length}`;
        console.log(msgFinish);
        sendAdminDebug(msgFinish);
        break;
      }
      cursor = data.next_cursor;
      page++;
    }
    // Simpan ke DB (array of username, handle map jika objek)
    const commentUsernames = allComments
      .map(c => c.user?.unique_id)
      .filter(Boolean);
    const msg2 = `[DEBUG] fetchAllTikTokCommentsToday: saveTiktokComments untuk video_id=${video_id}, total commenters=${commentUsernames.length}`;
    console.log(msg2);
    sendAdminDebug(msg2);
    await saveTiktokComments(video_id, commentUsernames);
    return commentUsernames;
  } catch (err) {
    const msgErr = `[ERROR] fetchAllTikTokCommentsToday error: ${err.message}`;
    console.error(msgErr);
    sendAdminDebug(msgErr);
    throw err;
  }
}
