import axios from 'axios';
import pLimit from 'p-limit';
import { pool } from '../config/db.js';

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const RAPIDAPI_HOST = 'instagram-scraper-2023.p.rapidapi.com';
const limit = pLimit(4);

// Patch: isTodayWIB untuk cek post hari ini di WIB
function isTodayWIB(dateObj) {
  if (!dateObj) return false;
  // UTC+7
  const dateWIB = new Date(dateObj.getTime() + 7 * 60 * 60 * 1000);
  const now = new Date();
  const todayWIB = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  return dateWIB.getFullYear() === todayWIB.getFullYear() &&
    dateWIB.getMonth() === todayWIB.getMonth() &&
    dateWIB.getDate() === todayWIB.getDate();
}

async function getEligibleInstaClients() {
  const res = await pool.query(
    `SELECT client_id, client_insta FROM clients
      WHERE client_status = true AND client_insta_status = true AND client_insta IS NOT NULL AND client_insta <> ''`
  );
  return res.rows;
}

export async function fetchAndStoreInstaContent(keys = null, waClient = null, chatId = null) {
  const clients = await getEligibleInstaClients();
  let totalKontenHariIni = 0;
  let debugGlobal = [];

  console.log('\n===== [INSTA FETCH START] =====');
  console.log('[DEBUG] Total clients eligible:', clients.length);

  for (const client of clients) {
    console.log(`\n[CLIENT] ID: ${client.client_id}, Instagram: ${client.client_insta}`);

    let posts = [];
    try {
      // Fetch posts by username
      console.log(`  [FETCH] Posts Instagram: ${client.client_insta}`);
      const res = await limit(() =>
        axios.get(`https://${RAPIDAPI_HOST}/posts`, {
          params: { username: client.client_insta },
          headers: {
            'x-rapidapi-key': RAPIDAPI_KEY,
            'x-rapidapi-host': RAPIDAPI_HOST,
          },
        })
      );
      // Struktur response Instagram API bisa berubah, biasanya data.data
      posts = res.data?.data?.edges || [];
      const jumlahPosts = Array.isArray(posts) ? posts.length : 0;
      console.log(`  [RESULT] Jumlah posts ditemukan: ${jumlahPosts}`);

      // PATCH DEBUG Tanggal post Instagram
      if (jumlahPosts > 0) {
        const tanggalPostWIB = posts.map(p => {
          const d = new Date((p.node?.taken_at_timestamp || p.node?.taken_at || 0) * 1000);
          return new Date(d.getTime() + 7 * 60 * 60 * 1000);
        });
        const earliest = new Date(Math.min(...tanggalPostWIB));
        const latest = new Date(Math.max(...tanggalPostWIB));
        console.log(`[DEBUG][${client.client_id}] Tanggal post Instagram terawal (WIB): ${earliest.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}`);
        console.log(`[DEBUG][${client.client_id}] Tanggal post Instagram terakhir (WIB): ${latest.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}`);
      } else {
        console.log(`[DEBUG][${client.client_id}] Tidak ada post Instagram ditemukan dari API.`);
      }
    } catch (err) {
      console.error(`[ERROR] Gagal fetch Instagram untuk client_id=${client.client_id}: ${err.message}`);
      if (waClient && typeof waClient.sendMessage === 'function' && chatId)
        await waClient.sendMessage(chatId, `❌ Gagal fetch Instagram untuk ${client.client_insta}: ${err.message}`);
      continue;
    }

    // Filter & simpan hanya post hari ini (berdasarkan WIB)
    let kontenHariIni = [];
    for (const post of posts) {
      const ts = post.node?.taken_at_timestamp || post.node?.taken_at || 0;
      const postDate = ts ? new Date(ts * 1000) : null;
      if (!isTodayWIB(postDate)) continue;
      kontenHariIni.push(post);

      // Patch: ambil field penting dan masukkan ke DB
      const code = post.node?.shortcode;
      const caption = post.node?.edge_media_to_caption?.edges?.[0]?.node?.text || '';
      const like_count = post.node?.edge_liked_by?.count || post.node?.like_count || 0;
      const comment_count = post.node?.edge_media_to_comment?.count || post.node?.comment_count || 0;

      await pool.query(
        `INSERT INTO insta_post (shortcode, client_id, caption, taken_at, like_count, comment_count)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (shortcode) DO UPDATE SET
            caption = EXCLUDED.caption,
            like_count = EXCLUDED.like_count,
            comment_count = EXCLUDED.comment_count,
            taken_at = EXCLUDED.taken_at`,
        [
          code,
          client.client_id,
          caption,
          postDate,
          like_count,
          comment_count,
        ]
      );
    }

    // Debug PATCH: Berapa post yang lolos filter hari ini (WIB)
    console.log(`[DEBUG][${client.client_id}] Post yang terdeteksi hari ini (WIB): ${kontenHariIni.length}`);
    if (kontenHariIni.length === 0) {
      console.log(`[DEBUG][${client.client_id}] Tidak ada post yang lolos filter hari ini. Kemungkinan besar masalah timezone atau memang tidak ada postingan hari ini.`);
    }

    totalKontenHariIni += kontenHariIni.length;

    // Debug ringkas per client
    console.log(`  [SUMMARY] Konten hari ini Instagram (client_id: ${client.client_id}): ${kontenHariIni.length}`);
    if (kontenHariIni.length) {
      const minDate = Math.min(...kontenHariIni.map(p =>
        (p.node?.taken_at_timestamp || p.node?.taken_at || 0)
      ));
      const maxDate = Math.max(...kontenHariIni.map(p =>
        (p.node?.taken_at_timestamp || p.node?.taken_at || 0)
      ));
      console.log(`    [SUMMARY] Tanggal konten hari ini: ${new Date(minDate * 1000).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} - ${new Date(maxDate * 1000).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}`);
    }

    debugGlobal.push(`Client ${client.client_insta}: ${kontenHariIni.length} konten hari ini`);
  }

  // Summary global
  const summaryMsg = `✅ Fetch Instagram selesai!\nJumlah konten hari ini: *${totalKontenHariIni}*`;
  if (waClient && typeof waClient.sendMessage === 'function' && chatId) {
    await waClient.sendMessage(chatId, summaryMsg);
  } else {
    console.log(summaryMsg);
  }
  // Akhir ringkas
  console.log(`[DEBUG][INSTA] Ringkasan fetch:`, debugGlobal.join(' | '));
  console.log(`===== [INSTA FETCH END] =====\n`);
}
