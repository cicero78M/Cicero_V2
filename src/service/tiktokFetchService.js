// src/service/tiktokFetchService.js

import axios from 'axios';
import pLimit from 'p-limit';
import * as tiktokPostModel from '../model/tiktokPostModel.js';
import * as tiktokCommentModel from '../model/tiktokCommentModel.js';
import { pool } from '../config/db.js';

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const RAPIDAPI_HOST = 'tiktok-api23.p.rapidapi.com';
const limit = pLimit(4);

function isToday(unixTimestamp) {
  if (!unixTimestamp) return false;
  const d = new Date(unixTimestamp * 1000); // detik ke ms
  const today = new Date();
  return d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate();
}

async function getEligibleTiktokClients() {
  const res = await pool.query(
    `SELECT client_id, client_tiktok, tiktok_secuid FROM clients
      WHERE client_status = true AND client_tiktok_status = true AND client_tiktok IS NOT NULL AND client_tiktok <> ''`
  );
  return res.rows;
}

export async function fetchAndStoreTiktokContent(waClient = null, chatId = null) {
  const clients = await getEligibleTiktokClients();
  let totalKontenHariIni = 0;
  let allDebugLogs = [];

  console.log(`\n===== [TIKTOK FETCH START] =====`);
  console.log(`Total clients eligible: ${clients.length}`);

  for (const client of clients) {
    console.log(`\n[CLIENT] ID: ${client.client_id}, TikTok: ${client.client_tiktok}`);
    // Pastikan secUid ada, jika belum ambil via API
    let secUid = client.tiktok_secuid;
    if (!secUid || secUid.length < 10) {
      try {
        console.log(`  [INFO] Mencari secUid untuk username: ${client.client_tiktok}`);
        const secUidRes = await axios.get(`https://${RAPIDAPI_HOST}/api/user/info`, {
          params: { unique_id: client.client_tiktok },
          headers: {
            'x-rapidapi-key': RAPIDAPI_KEY,
            'x-rapidapi-host': RAPIDAPI_HOST
          }
        });
        secUid = secUidRes.data?.data?.user?.secUid;
        console.log(`  [RESULT] secUid: ${secUid}`);
        if (secUid) {
          await pool.query(
            `UPDATE clients SET tiktok_secuid = $1 WHERE client_id = $2`,
            [secUid, client.client_id]
          );
        } else {
          console.warn(`  [SKIP] Tidak bisa ambil secUid untuk client_id=${client.client_id}`);
          continue;
        }
      } catch (e) {
        console.warn(`  [SKIP] Gagal ambil secUid untuk client_id=${client.client_id}: ${e.message}`);
        continue;
      }
    }

    // Fetch post TikTok (API /api/user/posts)
    let posts = [];
    try {
      console.log(`  [FETCH] Posts TikTok secUid: ${secUid}`);
      const res = await limit(() =>
        axios.get(`https://${RAPIDAPI_HOST}/api/user/posts`, {
          params: { secUid: secUid, count: 35, cursor: 0 },
          headers: {
            'x-rapidapi-key': RAPIDAPI_KEY,
            'x-rapidapi-host': RAPIDAPI_HOST
          }
        })
      );
      // Log full path, bisa disesuaikan jika format beda
      console.log("  [API RAW]", JSON.stringify(res.data).substring(0, 500) + '...');
      // PATCH: akses itemList, BUKAN posts!
      posts = res.data?.data?.itemList || [];
      if (!Array.isArray(posts)) {
        console.warn("  [API WARNING] Response data.itemList kosong atau bukan array! Struktur response:", JSON.stringify(res.data).substring(0, 350));
        posts = [];
      }
      console.log(`  [RESULT] Jumlah posts: ${posts.length}`);
    } catch (err) {
      console.error(`[ERROR] Gagal fetch TikTok untuk client_id=${client.client_id}: ${err.message}`);
      if (waClient && typeof waClient.sendMessage === 'function' && chatId)
        await waClient.sendMessage(chatId, `❌ Gagal fetch TikTok untuk ${client.client_tiktok}: ${err.message}`);
      continue;
    }

    // Filter & simpan hanya post hari ini
    let kontenHariIni = [];
    for (const post of posts) {
      const postDate = post.createTime ? new Date(post.createTime * 1000) : null;
      const isHariIni = isToday(post.createTime);

      allDebugLogs.push(
        `[DEBUG] Client: ${client.client_tiktok} | Post ID: ${post.id} | createTime: ${post.createTime} | Date: ${postDate} | Hari Ini: ${isHariIni}`
      );
      if (!isHariIni) continue;
      kontenHariIni.push(post);

      // Insert/update post
      await tiktokPostModel.upsertTiktokPost({
        id: post.id,
        client_id: client.client_id,
        caption: post.desc || null,
        created_at: post.createTime, // UNIX detik
        comment_count: post.stats?.commentCount || 0,
        url: `https://www.tiktok.com/@${post.author?.uniqueId || ''}/video/${post.id}`
      });

      // Fetch komentar (API /api/post/comments)
      let comments = [];
      try {
        const res = await limit(() =>
          axios.get(`https://${RAPIDAPI_HOST}/api/post/comments`, {
            params: { post_id: post.id, count: 100, cursor: 0 },
            headers: {
              'x-rapidapi-key': RAPIDAPI_KEY,
              'x-rapidapi-host': RAPIDAPI_HOST
            }
          })
        );
        comments = res.data?.data?.comments || [];
        console.log(`    [KOMEN] Post ${post.id}, Jumlah komentar: ${comments.length}`);
      } catch (e) {
        comments = [];
        console.log(`    [KOMEN] Gagal fetch comment post: ${post.id}`);
      }
      await tiktokCommentModel.upsertTiktokComments(post.id, comments);
    }

    totalKontenHariIni += kontenHariIni.length;

    // WA: summary per client
    if (waClient && typeof waClient.sendMessage === 'function' && chatId) {
      await waClient.sendMessage(
        chatId,
        `TikTok Client: ${client.client_tiktok}\nKonten hari ini: ${kontenHariIni.length}\n` +
        (kontenHariIni.length === 0 ? "Cek waktu post & timezone!\n" : "") +
        allDebugLogs.slice(-kontenHariIni.length || -5).join('\n')
      );
    }
    // Debug ringkas
    console.log(`  [SUMMARY] Konten hari ini (client_id: ${client.client_id}): ${kontenHariIni.length}`);
    kontenHariIni.forEach((p, i) => {
      console.log(`    - PostID: ${p.id}, Date: ${new Date(p.createTime * 1000)}`);
    });
  }

  // Summary global
  const summaryMsg = `✅ Fetch TikTok selesai!\nJumlah konten hari ini: *${totalKontenHariIni}*`;
  if (waClient && typeof waClient.sendMessage === 'function' && chatId) {
    await waClient.sendMessage(chatId, summaryMsg);
    if (totalKontenHariIni === 0) {
      await waClient.sendMessage(chatId, "[DEBUG TikTok]\n" + allDebugLogs.slice(-15).join('\n'));
    }
  } else {
    console.log(summaryMsg);
    if (totalKontenHariIni === 0) {
      console.log("[DEBUG TikTok]\n" + allDebugLogs.slice(-15).join('\n'));
    }
  }
  console.log(`===== [TIKTOK FETCH END] =====\n`);
}
