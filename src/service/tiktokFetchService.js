import axios from 'axios';
import pLimit from 'p-limit';
import { pool } from '../config/db.js';
import * as tiktokCommentModel from '../model/tiktokCommentModel.js';

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const RAPIDAPI_HOST = 'tiktok-api23.p.rapidapi.com';
const limit = pLimit(6);

function isToday(dateObj) {
  if (!dateObj) return false;
  const today = new Date();
  return dateObj.getFullYear() === today.getFullYear() &&
    dateObj.getMonth() === today.getMonth() &&
    dateObj.getDate() === today.getDate();
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
  let debugGlobal = [];

  console.log(`\n===== [TIKTOK FETCH START] =====`);
  console.log(`[DEBUG] Total clients eligible: ${clients.length}`);

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
        console.log(`  [RESULT] secUid ditemukan? ${!!secUid}`);
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
      posts = res.data?.data?.itemList || [];
      const jumlahPosts = Array.isArray(posts) ? posts.length : 0;
      console.log(`  [RESULT] Jumlah posts ditemukan: ${jumlahPosts}`);
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
      const isHariIni = isToday(postDate);

      if (!isHariIni) continue;
      kontenHariIni.push(post);

      // Insert/update post ke tiktok_post (kolom: video_id, client_id, caption, created_at, like_count, comment_count)
      await pool.query(`
        INSERT INTO tiktok_post (video_id, client_id, caption, created_at, like_count, comment_count)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (video_id) DO UPDATE SET
          client_id = EXCLUDED.client_id,
          caption = EXCLUDED.caption,
          created_at = EXCLUDED.created_at,
          like_count = EXCLUDED.like_count,
          comment_count = EXCLUDED.comment_count
      `, [
        post.id,
        client.client_id,
        post.desc || null,
        postDate,
        post.stats?.diggCount || 0,
        post.stats?.commentCount || 0
      ]);

      // Fetch komentar (API /api/post/comments)
      let usernames = [];
      try {
        const res = await limit(() =>
          axios.get(`https://${RAPIDAPI_HOST}/api/post/comments`, {
            params: { videoId: post.id, count: 100, cursor: 0 },
            headers: {
              'x-rapidapi-key': RAPIDAPI_KEY,
              'x-rapidapi-host': RAPIDAPI_HOST
            }
          })
        );
        usernames = res.data?.comments?.map(c => c.user?.unique_id).filter(Boolean) || [];
        // Debug jumlah komentar
        console.log(`    [KOMEN] Video ${post.id}, jumlah komentar user: ${usernames.length}`);
      } catch (e) {
        usernames = [];
        console.log(`    [KOMEN] Gagal fetch comment video: ${post.id}`);
        if (e.response) {
          console.error('      [ERR DETAIL]', e.response?.data?.message || JSON.stringify(e.response.data).substring(0, 120));
        } else {
          console.error('      [ERR MSG]', e.message);
        }
      }
      // Simpan array username ke tiktok_comment.comments (jsonb)
      await tiktokCommentModel.upsertTiktokComments(post.id, usernames);
    }

    totalKontenHariIni += kontenHariIni.length;

    // Debug ringkas per client
    console.log(`  [SUMMARY] Konten hari ini TikTok (client_id: ${client.client_id}): ${kontenHariIni.length}`);
    if (kontenHariIni.length) {
      const minDate = Math.min(...kontenHariIni.map(p => p.createTime));
      const maxDate = Math.max(...kontenHariIni.map(p => p.createTime));
      console.log(`    [SUMMARY] Tanggal konten hari ini: ${new Date(minDate * 1000).toLocaleString()} - ${new Date(maxDate * 1000).toLocaleString()}`);
    }

    debugGlobal.push(`Client ${client.client_tiktok}: ${kontenHariIni.length} konten hari ini`);
  }

  // Summary global
  const summaryMsg = `✅ Fetch TikTok selesai!\nJumlah konten hari ini: *${totalKontenHariIni}*`;
  if (waClient && typeof waClient.sendMessage === 'function' && chatId) {
    await waClient.sendMessage(chatId, summaryMsg);
  } else {
    console.log(summaryMsg);
  }
  // Akhir ringkas
  console.log(`[DEBUG][TIKTOK] Ringkasan fetch:`, debugGlobal.join(' | '));
  console.log(`===== [TIKTOK FETCH END] =====\n`);
}
