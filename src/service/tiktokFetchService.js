import axios from 'axios';
import { pool } from '../config/db.js';

// === KONFIGURASI API ===
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const RAPIDAPI_HOST = 'tiktok-api23.p.rapidapi.com';

// Helper: cek unix timestamp hari ini
function isToday(unixTimestamp) {
  if (!unixTimestamp) return false;
  const d = new Date(unixTimestamp * 1000);
  const today = new Date();
  return d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate();
}

// Helper: upsert tiktok post ke DB
async function upsertTiktokPost(postData) {
  await pool.query(
    `INSERT INTO tiktok_post (id, client_id, caption, created_at, comment_count, url)
     VALUES ($1, $2, $3, to_timestamp($4), $5, $6)
     ON CONFLICT (id) DO UPDATE
     SET caption = EXCLUDED.caption,
         comment_count = EXCLUDED.comment_count,
         created_at = EXCLUDED.created_at,
         url = EXCLUDED.url`,
    [
      postData.id,
      postData.client_id,
      postData.caption,
      postData.created_at,
      postData.comment_count,
      postData.url
    ]
  );
}

// Helper: upsert komentar tiktok ke DB
async function upsertTiktokComments(postId, comments) {
  await pool.query(
    `INSERT INTO tiktok_comment (post_id, comments, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (post_id) DO UPDATE
     SET comments = EXCLUDED.comments, updated_at = NOW()`,
    [postId, JSON.stringify(comments)]
  );
}

// Helper: ambil secUid dari TikTok API
async function fetchTiktokSecUid(username) {
  if (!username) return null;
  const url = `https://${RAPIDAPI_HOST}/api/user/info`;
  try {
    const res = await axios.get(url, {
      params: { unique_id: username },
      headers: {
        'x-rapidapi-key': RAPIDAPI_KEY,
        'x-rapidapi-host': RAPIDAPI_HOST
      }
    });
    return res.data?.data?.user?.secUid || null;
  } catch (err) {
    console.error('[ERROR] fetchTiktokSecUid:', err.response?.data || err.message);
    return null;
  }
}

// Update secUid ke kolom tiktok_secuid di database
async function updateClientSecUid(client_id, secUid) {
  if (!client_id || !secUid) return false;
  const res = await pool.query(
    `UPDATE clients SET tiktok_secuid = $1 WHERE client_id = $2`,
    [secUid, client_id]
  );
  return res.rowCount > 0;
}

// Ambil semua client TikTok eligible
async function getEligibleTiktokClients() {
  // Perhatikan field: client_tiktok = username TikTok, tiktok_secuid = secUid TikTok
  const res = await pool.query(
    `SELECT client_id, tiktok_secuid, client_tiktok
     FROM clients
     WHERE client_status = true AND client_tiktok_status = true
       AND client_tiktok IS NOT NULL AND client_tiktok != ''`
  );
  return res.rows;
}

export async function fetchAndStoreTiktokContent(isManual = false, waClient = null, chatId = null) {
  const clients = await getEligibleTiktokClients();
  let totalKonten = 0;
  let kontenLinks = [];

  for (const client of clients) {
    let secUid = client.tiktok_secuid;

    // Ambil secUid jika belum ada
    if (!secUid || secUid.length < 10) {
      const username = client.client_tiktok;
      if (username) {
        secUid = await fetchTiktokSecUid(username);
        if (secUid) await updateClientSecUid(client.client_id, secUid);
        else {
          console.warn(`[SKIP] Tidak bisa ambil secUid untuk ${client.client_id} (${username})`);
          continue;
        }
      } else {
        console.warn(`[SKIP] Client ${client.client_id} tidak punya username TikTok`);
        continue;
      }
    }

    // Fetch posts TikTok pakai secUid
    let posts = [];
    try {
      const res = await axios.get(`https://${RAPIDAPI_HOST}/api/user/posts`, {
        params: { secUid, count: 35, cursor: 0 },
        headers: {
          'x-rapidapi-key': RAPIDAPI_KEY,
          'x-rapidapi-host': RAPIDAPI_HOST
        }
      });
      posts = res.data?.data?.itemList || [];
    } catch (err) {
      console.error(`TikTok API Error (client ${client.client_id}):`, err.response?.data || err.message);
      continue;
    }

    for (const post of posts) {
      if (!isToday(post.createTime)) continue;
      const postData = {
        id: post.id,
        client_id: client.client_id,
        caption: post.desc || '',
        created_at: post.createTime,
        comment_count: post.stats?.commentCount || 0,
        url: `https://www.tiktok.com/@${post.author?.uniqueId || ''}/video/${post.id}`
      };
      await upsertTiktokPost(postData);

      kontenLinks.push(postData.url);
      totalKonten++;

      // Fetch & simpan komentar TikTok
      let comments = [];
      try {
        const commentRes = await axios.get(`https://${RAPIDAPI_HOST}/api/item/comments`, {
          params: { itemId: post.id, count: 100, cursor: 0 },
          headers: {
            'x-rapidapi-key': RAPIDAPI_KEY,
            'x-rapidapi-host': RAPIDAPI_HOST
          }
        });
        comments = commentRes.data?.comments || [];
      } catch (err) {
        console.error(`Komentar TikTok Error (post ${post.id}):`, err.response?.data || err.message);
      }

      const mappedComments = comments.map(comment => ({
        cid: comment.cid,
        username: comment.user?.unique_id || comment.user?.uniqueId || '',
        text: comment.text,
        create_time: comment.create_time
      }));
      await upsertTiktokComments(post.id, mappedComments);
    }
  }

  // Kirim rekap jika manual WA
  if (isManual && waClient && chatId) {
    let pesan = `✅ Fetch TikTok selesai!\nJumlah konten hari ini: *${totalKonten}*\n`;
    if (kontenLinks.length) {
      let maxPerMsg = 30;
      const totalMsg = Math.ceil(kontenLinks.length / maxPerMsg);
      for (let i = 0; i < totalMsg; i++) {
        const linksMsg = kontenLinks.slice(i * maxPerMsg, (i + 1) * maxPerMsg).join('\n');
        await waClient.sendMessage(chatId, `Link TikTok:\n${linksMsg}`);
      }
    }
    return { message: pesan };
  }
  return { message: `Fetch TikTok selesai. Konten hari ini: ${totalKonten}` };
}
