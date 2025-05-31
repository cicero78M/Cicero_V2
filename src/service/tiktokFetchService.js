import axios from 'axios';
import pLimit from 'p-limit';
import { pool } from '../config/db.js';
import * as tiktokCommentModel from '../model/tiktokCommentModel.js';
import { getPostsTodayByClient } from '../model/tiktokPostModel.js';

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const RAPIDAPI_HOST = 'tiktok-api23.p.rapidapi.com';
const limit = pLimit(6);

// Patch: isTodayEpoch, menerima UNIX epoch detik, bandingkan dengan hari WIB
function isTodayEpoch(epoch) {
  if (!epoch) return false;
  const d = new Date(epoch * 1000 + 7 * 60 * 60 * 1000);
  const now = new Date(Date.now() + 7 * 60 * 60 * 1000);
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

// Fetch komentar dari semua video TikTok hari ini pada client ini (langsung update DB)
export async function fetchCommentsTodayByClient(client_id, debugCallback = null) {
  const postsToday = await getPostsTodayByClient(client_id);
  let totalFetched = 0, failed = 0;
  let debugArr = [];
  for (const video_id of postsToday) {
    try {
      const res = await limit(() =>
        axios.get(`https://${RAPIDAPI_HOST}/api/post/comments`, {
          params: { videoId: video_id, count: 100, cursor: 0 },
          headers: {
            'x-rapidapi-key': RAPIDAPI_KEY,
            'x-rapidapi-host': RAPIDAPI_HOST
          }
        })
      );
      const usernames = res.data?.comments?.map(c => c.user?.unique_id).filter(Boolean) || [];
      await tiktokCommentModel.upsertTiktokComments(video_id, usernames);
      totalFetched++;
      const debugLine = `[FETCH COMMENT] Success video_id: ${video_id} | komentar: ${usernames.length}`;
      debugArr.push(debugLine);
      if (debugCallback) await debugCallback(debugLine);
      else console.log(debugLine);
    } catch (e) {
      failed++;
      const errLine = `[FETCH COMMENT] Failed video_id: ${video_id} | ${e.message}`;
      debugArr.push(errLine);
      if (debugCallback) await debugCallback(errLine);
      else console.log(errLine);
    }
  }
  return { total: postsToday.length, totalFetched, failed, debug: debugArr };
}

export async function fetchAndStoreTiktokContent(waClient = null, chatId = null, onlyClientId = null) {
  const clients = onlyClientId
    ? (await pool.query(
        `SELECT client_id, client_tiktok, tiktok_secuid FROM clients
         WHERE client_id = $1 AND client_status = true AND client_tiktok_status = true AND client_tiktok IS NOT NULL AND client_tiktok <> ''`, 
        [onlyClientId]
      )).rows
    : await (await pool.query(
        `SELECT client_id, client_tiktok, tiktok_secuid FROM clients
         WHERE client_status = true AND client_tiktok_status = true AND client_tiktok IS NOT NULL AND client_tiktok <> ''`
      )).rows;

  let totalKontenHariIni = 0;
  let debugGlobal = [];
  let responseObj = {};

  console.log(`\n===== [TIKTOK FETCH START] =====`);
  console.log(`[DEBUG] Total clients eligible: ${clients.length}`);

  for (const client of clients) {
    const debugLines = [];
    debugLines.push(`\n[CLIENT] ID: ${client.client_id}, TikTok: ${client.client_tiktok}`);

    // Pastikan secUid ada, jika belum ambil via API
    let secUid = client.tiktok_secuid;
    if (!secUid || secUid.length < 10) {
      try {
        debugLines.push(`  [INFO] Mencari secUid untuk username: ${client.client_tiktok}`);
        const secUidRes = await axios.get(`https://${RAPIDAPI_HOST}/api/user/info`, {
          params: { unique_id: client.client_tiktok },
          headers: {
            'x-rapidapi-key': RAPIDAPI_KEY,
            'x-rapidapi-host': RAPIDAPI_HOST
          }
        });
        secUid = secUidRes.data?.data?.user?.secUid;
        debugLines.push(`  [RESULT] secUid ditemukan? ${!!secUid}`);
        if (secUid) {
          await pool.query(
            `UPDATE clients SET tiktok_secuid = $1 WHERE client_id = $2`,
            [secUid, client.client_id]
          );
        } else {
          debugLines.push(`  [SKIP] Tidak bisa ambil secUid untuk client_id=${client.client_id}`);
          console.warn(debugLines.at(-1));
          continue;
        }
      } catch (e) {
        debugLines.push(`  [SKIP] Gagal ambil secUid untuk client_id=${client.client_id}: ${e.message}`);
        console.warn(debugLines.at(-1));
        continue;
      }
    }

    // Fetch post TikTok (API /api/user/posts)
    let posts = [];
    try {
      debugLines.push(`  [FETCH] Posts TikTok secUid: ${secUid}`);
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
      debugLines.push(`  [RESULT] Jumlah posts ditemukan: ${jumlahPosts}`);

      // PATCH DEBUG: Daftar tanggal post TikTok (WIB)
      posts.forEach(p => {
        const rawEpoch = p.createTime || 0;
        const wibDate = new Date(rawEpoch * 1000 + 7 * 60 * 60 * 1000);
        debugLines.push(
          `[DEBUG][${client.client_id}] POST ID ${p.id} | createTime: ${rawEpoch} | WIB: ${wibDate.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}`
        );
      });

      if (jumlahPosts > 0) {
        const tanggalPostWIB = posts.map(p => {
          const d = new Date((p.createTime || 0) * 1000 + 7 * 60 * 60 * 1000);
          return d.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
        });
        debugLines.push(`[DEBUG][${client.client_id}] Daftar tanggal post TikTok (WIB):\n  ` + tanggalPostWIB.join('\n  '));
        const earliest = new Date(Math.min(...posts.map(p => (p.createTime || 0) * 1000 + 7 * 60 * 60 * 1000)));
        const latest = new Date(Math.max(...posts.map(p => (p.createTime || 0) * 1000 + 7 * 60 * 60 * 1000)));
        debugLines.push(`[DEBUG][${client.client_id}] Tanggal post TikTok terawal (WIB): ${earliest.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}`);
        debugLines.push(`[DEBUG][${client.client_id}] Tanggal post TikTok terakhir (WIB): ${latest.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}`);
      } else {
        debugLines.push(`[DEBUG][${client.client_id}] Tidak ada post TikTok ditemukan dari API.`);
      }
    } catch (err) {
      debugLines.push(`[ERROR] Gagal fetch TikTok untuk client_id=${client.client_id}: ${err.message}`);
      if (waClient && typeof waClient.sendMessage === 'function' && chatId)
        await waClient.sendMessage(chatId, `❌ Gagal fetch TikTok untuk ${client.client_tiktok}: ${err.message}`);
      console.error(debugLines.at(-1));
      continue;
    }

    // Filter & simpan hanya post hari ini (berdasarkan WIB)
    let kontenHariIni = [];
    for (const post of posts) {
      const videoId = post.id;
      const caption = post.desc || '';
      const postDateEpoch = post.createTime;
      const likeCount = post.stats?.diggCount || 0;
      const commentCount = post.stats?.commentCount || 0;

      // PATCH DEBUG: cek tanggal epoch & hasil filter
      const d = new Date((postDateEpoch || 0) * 1000 + 7 * 60 * 60 * 1000);
      debugLines.push(`[DEBUG][${client.client_id}] [FILTER] VideoId: ${videoId} | Epoch: ${postDateEpoch} | WIB: ${d.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} | isTodayEpoch: ${isTodayEpoch(postDateEpoch)}`);

      if (!isTodayEpoch(postDateEpoch)) continue;
      kontenHariIni.push(post);

      // Insert/update post ke tiktok_post
      await pool.query(`
        INSERT INTO tiktok_post (video_id, client_id, caption, created_at, like_count, comment_count)
        VALUES ($1, $2, $3, to_timestamp($4), $5, $6)
        ON CONFLICT (video_id) DO UPDATE SET
          client_id = EXCLUDED.client_id,
          caption = EXCLUDED.caption,
          created_at = EXCLUDED.created_at,
          like_count = EXCLUDED.like_count,
          comment_count = EXCLUDED.comment_count
      `, [
        videoId,
        client.client_id,
        caption,
        postDateEpoch,
        likeCount,
        commentCount
      ]);
      debugLines.push(`[DB] Upsert post: ${videoId} | ${caption.slice(0, 20)}... | ${postDateEpoch}`);

      // Fetch komentar (API /api/post/comments)
      let usernames = [];
      try {
        const res = await limit(() =>
          axios.get(`https://${RAPIDAPI_HOST}/api/post/comments`, {
            params: { videoId: videoId, count: 100, cursor: 0 },
            headers: {
              'x-rapidapi-key': RAPIDAPI_KEY,
              'x-rapidapi-host': RAPIDAPI_HOST
            }
          })
        );
        usernames = res.data?.comments?.map(c => c.user?.unique_id).filter(Boolean) || [];
        debugLines.push(`    [KOMEN] Video ${videoId}, jumlah komentar user: ${usernames.length}`);
      } catch (e) {
        usernames = [];
        debugLines.push(`    [KOMEN] Gagal fetch comment video: ${videoId} | ERR: ${e.message}`);
        if (e.response) {
          debugLines.push('      [ERR DETAIL] ' + (e.response?.data?.message || JSON.stringify(e.response.data).substring(0, 120)));
        } else {
          debugLines.push('      [ERR MSG] ' + e.message);
        }
      }
      await tiktokCommentModel.upsertTiktokComments(videoId, usernames);
      debugLines.push(`[DB] Upsert komentar video: ${videoId} | ${usernames.length} username`);
    }

    // Debug PATCH: Berapa post yang lolos filter hari ini (WIB)
    debugLines.push(`[DEBUG][${client.client_id}] Post yang terdeteksi hari ini (WIB): ${kontenHariIni.length}`);
    if (kontenHariIni.length === 0) {
      debugLines.push(`[DEBUG][${client.client_id}] Tidak ada post yang lolos filter hari ini. Kemungkinan besar masalah timezone atau memang tidak ada postingan hari ini.`);
    }

    totalKontenHariIni += kontenHariIni.length;
    debugLines.push(`  [SUMMARY] Konten hari ini TikTok (client_id: ${client.client_id}): ${kontenHariIni.length}`);
    if (kontenHariIni.length) {
      const minDate = Math.min(...kontenHariIni.map(p => p.createTime * 1000));
      const maxDate = Math.max(...kontenHariIni.map(p => p.createTime * 1000));
      debugLines.push(`    [SUMMARY] Tanggal konten hari ini: ${new Date(minDate + 7 * 60 * 60 * 1000).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} - ${new Date(maxDate + 7 * 60 * 60 * 1000).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}`);
    }

    debugGlobal.push(debugLines.join('\n'));
    // Return info per client
    responseObj[client.client_id] = {
      postsToday: kontenHariIni,
      totalHariIni: kontenHariIni.length,
      debug: debugLines.join('\n')
    };

    // Juga kirim ke WA jika ada
    if (waClient && typeof waClient.sendMessage === 'function' && chatId) {
      await waClient.sendMessage(chatId, debugLines.join('\n'));
    }
  }

  // Summary global
  const summaryMsg = `✅ Fetch TikTok selesai!\nJumlah konten hari ini: *${totalKontenHariIni}*`;
  if (waClient && typeof waClient.sendMessage === 'function' && chatId) {
    await waClient.sendMessage(chatId, summaryMsg);
  } else {
    console.log(summaryMsg);
  }
  console.log(`[DEBUG][TIKTOK] Ringkasan fetch:\n`, debugGlobal.join('\n\n'));
  console.log(`===== [TIKTOK FETCH END] =====\n`);

  // PATCH: return detail per client agar bisa dipakai handler WA atau absensi
  return responseObj;
}
