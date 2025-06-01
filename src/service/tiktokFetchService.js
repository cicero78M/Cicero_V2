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

// Normalisasi TikTok post agar insert ke DB konsisten
function normalizeTiktokPost(post) {
  // Handle beberapa struktur: TikTok API kadang mengirim field tidak konsisten
  return {
    video_id: post.id || post.video_id,
    desc: post.desc || post.caption || "",
    create_time: post.createTime || post.create_time, // UNIX seconds
    digg_count: (post.stats?.diggCount ?? post.digg_count ?? post.statistics?.diggCount ?? post.statistics?.likeCount ?? 0),
    comment_count: (post.stats?.commentCount ?? post.comment_count ?? post.statistics?.commentCount ?? 0),
  };
}

// PATCH FINAL: Fetch semua post hari ini berdasarkan secUid dan simpan ke DB
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
  let data = response.data;

  // --- Tambahan debug: response.data tipe dan fallback parse ---
  if (typeof data === "string") {
    sendAdminDebug(`[DEBUG] Tipe response.data: string, mencoba JSON.parse ...`);
    try {
      data = JSON.parse(data);
      sendAdminDebug(`[DEBUG] JSON.parse response.data sukses.`);
    } catch {
      sendAdminDebug(`[DEBUG] Gagal parse string ke JSON.`);
      data = {};
    }
  }
  if (!data || Object.keys(data).length === 0) {
    sendAdminDebug(`[DEBUG] response TikTok API kosong untuk client_id=${client_id}`);
    return [];
  }

  // --- DEBUG root payload & keys
  const rootKeys = Object.keys(data);
  const msgPayloadRoot = `[DEBUG] TikTok PAYLOAD ROOT KEYS: ${rootKeys.join(", ")}`;
  console.log(msgPayloadRoot);
  sendAdminDebug(msgPayloadRoot);

  // Otomatis deteksi array post (support field: itemList, posts, aweme_list, videoList, data)
  let postsArr = [];
  let fieldUsed = '';
  if (Array.isArray(data?.itemList) && data.itemList.length) {
    postsArr = data.itemList;
    fieldUsed = 'itemList';
  } else if (Array.isArray(data?.posts) && data.posts.length) {
    postsArr = data.posts;
    fieldUsed = 'posts';
  } else if (Array.isArray(data?.aweme_list) && data.aweme_list.length) {
    postsArr = data.aweme_list;
    fieldUsed = 'aweme_list';
  } else if (Array.isArray(data?.videoList) && data.videoList.length) {
    postsArr = data.videoList;
    fieldUsed = 'videoList';
  } else if (Array.isArray(data?.data) && data.data.length) {
    postsArr = data.data; // PATCH: TikTok response kadang rootnya 'data'
    fieldUsed = 'data';
  }
  const msgFieldUsed = `[DEBUG] TikTok POST FIELD USED: ${fieldUsed} (length=${postsArr.length})`;
  console.log(msgFieldUsed);
  sendAdminDebug(msgFieldUsed);

  // Debug tiap konten
  postsArr.forEach((post, idx) => {
    const tgl = post.createTime ? new Date(post.createTime * 1000).toISOString() : '-';
    const id = post.id || post.video_id || '-';
    sendAdminDebug(`[DEBUG][item ${idx+1}] id=${id} caption=${post.desc || post.caption || ''} createTime=${tgl}`);
  });

  // Filter post hari ini (Asia/Jakarta)
  const todayJakarta = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" }));
  function isTodayJakarta(ts) {
    const d = new Date(new Date(ts * 1000).toLocaleString("en-US", { timeZone: "Asia/Jakarta" }));
    return d.getFullYear() === todayJakarta.getFullYear() &&
           d.getMonth() === todayJakarta.getMonth() &&
           d.getDate() === todayJakarta.getDate();
  }
  const postsToday = postsArr.filter(post => isTodayJakarta(post.createTime || post.create_time));
  const msgTgl = `[DEBUG] Tanggal sistem Asia/Jakarta: ${todayJakarta.toISOString()}`;
  console.log(msgTgl);
  sendAdminDebug(msgTgl);

  const msg1 = `[DEBUG] fetchAndStoreTiktokContent: jumlah post hari ini=${postsToday.length}`;
  console.log(msg1);
  sendAdminDebug(msg1);

  if (postsToday.length > 0) {
    // PATCH: mapping normalization sebelum simpan DB
    const normalizedPosts = postsToday.map(normalizeTiktokPost);
    await upsertTiktokPosts(client_id, normalizedPosts);
    const msg2 = `[DEBUG] fetchAndStoreTiktokContent: sudah simpan ${normalizedPosts.length} post ke DB`;
    console.log(msg2);
    sendAdminDebug(msg2);
    return normalizedPosts;
  } else {
    const msg3 = `[DEBUG] fetchAndStoreTiktokContent: tidak ada post hari ini untuk ${client_id}`;
    console.log(msg3);
    sendAdminDebug(msg3);
    return [];
  }
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
