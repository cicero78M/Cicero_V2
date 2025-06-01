import axios from 'axios';
import pLimit from 'p-limit';
import { pool } from '../config/db.js';
import * as tiktokCommentModel from '../model/tiktokCommentModel.js';
import { getPostsTodayByClient } from '../model/tiktokPostModel.js';
import { getUsersByClient } from '../model/userModel.js'; // PENTING: pastikan fungsi ini ada

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const RAPIDAPI_HOST = 'tiktok-api23.p.rapidapi.com';
const limit = pLimit(6);

const ADMIN_WHATSAPP = (process.env.ADMIN_WHATSAPP || '')
  .split(',')
  .map(n => n.trim())
  .filter(Boolean);

function getAdminWAIds() {
  return ADMIN_WHATSAPP.map(n =>
    n.endsWith('@c.us') ? n : n.replace(/[^0-9]/g, '') + '@c.us'
  );
}

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

// PATCH BARU: Fungsi utama fetch & absensi TikTok hari ini per client
export async function fetchAndAbsensiTiktok(client, waClient = null, chatId = null) {
  let debugLines = [];
  let posts = [];

  // Step 1: Pastikan secUid
  let secUid = client.tiktok_secuid;
  if (!secUid || secUid.length < 10) {
    try {
      debugLines.push(`[INFO] Cari secUid untuk username: ${client.client_tiktok}`);
      const secUidRes = await axios.get(`https://${RAPIDAPI_HOST}/api/user/info`, {
        params: { unique_id: client.client_tiktok },
        headers: {
          'x-rapidapi-key': RAPIDAPI_KEY,
          'x-rapidapi-host': RAPIDAPI_HOST
        }
      });
      secUid = secUidRes.data?.data?.user?.secUid;
      debugLines.push(`[RESULT] secUid ditemukan? ${!!secUid}`);
      if (secUid) {
        await pool.query(
          `UPDATE clients SET tiktok_secuid = $1 WHERE client_id = $2`,
          [secUid, client.client_id]
        );
      } else {
        debugLines.push(`[SKIP] Tidak bisa ambil secUid untuk client_id=${client.client_id}`);
        await kirimDebug(debugLines, waClient, chatId);
        return;
      }
    } catch (e) {
      debugLines.push(`[SKIP] Gagal ambil secUid: ${e.message}`);
      await kirimDebug(debugLines, waClient, chatId);
      return;
    }
  }

  // Step 2: Fetch posts TikTok hari ini via API
  try {
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
    posts = posts.filter(p => isTodayEpoch(p.createTime));
    debugLines.push(`[FETCH] Post hari ini TikTok (WIB): ${posts.length}`);
  } catch (err) {
    debugLines.push(`[ERROR] Gagal fetch TikTok: ${err.message}`);
    await kirimDebug(debugLines, waClient, chatId);
    return;
  }

  let hasilAbsensi = [];

  // Step 3: Untuk setiap post, fetch komentar, fallback ke DB jika gagal, lalu absensi komentar
  for (const post of posts) {
    const videoId = post.id;
    const caption = post.desc || '';
    let comments = [];

    // Fetch komentar API, fallback ke DB jika error
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
      comments = res.data?.comments?.map(c => c.user?.unique_id).filter(Boolean) || [];
      debugLines.push(`[KOMEN] ${videoId}: Komentar dari API: ${comments.length}`);
      await tiktokCommentModel.upsertTiktokComments(videoId, comments);
    } catch (e) {
      // Fallback ke DB
      comments = await tiktokCommentModel.getCommentsByVideoId(videoId) || [];
      debugLines.push(`[KOMEN] ${videoId}: Fallback komentar dari DB: ${comments.length}`);
    }

    // Absensi komentar user
    const users = await getUsersByClient(client.client_id);
    const absensi = users.map(u => ({
      nama: u.nama,
      tiktok: u.tiktok,
      sudah: !!comments.find(c => c === u.tiktok),
    }));

    hasilAbsensi.push({
      videoId,
      caption: caption.slice(0, 60),
      komentar: comments.length,
      absensi
    });
  }

  // Step 4: Ringkasan & notifikasi
  let report = `*ABSENSI KOMENTAR TIKTOK* (${client.client_id} - ${client.client_tiktok})\nTanggal: ${new Date().toLocaleDateString('id-ID')}\n\n`;
  for (const h of hasilAbsensi) {
    report += `Video: ${h.videoId}\nCaption: ${h.caption}\nKomentar: ${h.komentar}\n`;
    const sudah = h.absensi.filter(x => x.sudah);
    const belum = h.absensi.filter(x => !x.sudah);
    report += `Sudah Komentar:\n`;
    report += sudah.length ? sudah.map(u => `- ${u.nama} (@${u.tiktok || '-'})`).join('\n') : '-\n';
    report += `\nBelum Komentar:\n`;
    report += belum.length ? belum.map(u => `- ${u.nama} (@${u.tiktok || '-'})`).join('\n') : '-\n';
    report += `\n-------------------\n`;
  }
  debugLines.push('[SUMMARY] Absensi komentar TikTok selesai.');

  await kirimDebug(debugLines.join('\n'), waClient, chatId);

  if (waClient && typeof waClient.sendMessage === 'function' && chatId) {
    await waClient.sendMessage(chatId, report);
  }
  // Juga broadcast ke semua ADMIN_WHATSAPP
  if (waClient && typeof waClient.sendMessage === 'function') {
    for (const admin of getAdminWAIds()) {
      try { await waClient.sendMessage(admin, report); } catch {}
    }
  }

  return hasilAbsensi;
}

// Utility kirim debug log ke WA & console
async function kirimDebug(debug, waClient, chatId) {
  if (typeof debug !== 'string') debug = debug.join('\n');
  console.log(debug);
  if (waClient && typeof waClient.sendMessage === 'function') {
    if (chatId) await waClient.sendMessage(chatId, debug);
    for (const admin of getAdminWAIds()) {
      try { await waClient.sendMessage(admin, debug); } catch {}
    }
  }
}

// Fungsi legacy tetap dipertahankan (boleh dihapus jika sudah tidak dipakai)
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

// Fungsi fetchAndStoreTiktokContent bisa dibuat redirect ke fetchAndAbsensiTiktok jika ingin backward compatible, atau silakan hapus jika sudah tidak dipakai.

