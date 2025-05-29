import axios from 'axios';
import { pool } from '../config/db.js';

// Konfigurasi API
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const RAPIDAPI_HOST = 'tiktok-api23.p.rapidapi.com';

// Utility: Cek apakah UNIX (detik) adalah hari ini
function isToday(unixSeconds) {
  if (!unixSeconds) return false;
  const d = new Date(unixSeconds * 1000);
  const today = new Date();
  return d.getFullYear() === today.getFullYear()
    && d.getMonth() === today.getMonth()
    && d.getDate() === today.getDate();
}

// Ambil semua client yang aktif & TikTok aktif
export async function getEligibleTiktokClients() {
  const res = await pool.query(
    `SELECT client_id, client_tiktok
     FROM clients
     WHERE client_status = true AND client_tiktok IS NOT NULL AND client_tiktok <> ''`
  );
  return res.rows;
}

// Save/update video TikTok
async function upsertTiktokPost(post) {
  await pool.query(
    `INSERT INTO tiktok_post (id, client_id, caption, created_at, comment_count, url)
     VALUES ($1, $2, $3, to_timestamp($4), $5, $6)
     ON CONFLICT (id) DO UPDATE
     SET caption = EXCLUDED.caption,
         created_at = EXCLUDED.created_at,
         comment_count = EXCLUDED.comment_count,
         url = EXCLUDED.url`,
    [post.id, post.client_id, post.caption, post.created_at, post.comment_count, post.url]
  );
}

// Save/update komentar TikTok
async function upsertTiktokComments(postId, comments) {
  for (const comment of comments) {
    await pool.query(
      `INSERT INTO tiktok_comment (id, post_id, username, text, created_at)
       VALUES ($1, $2, $3, $4, to_timestamp($5))
       ON CONFLICT (id) DO UPDATE
       SET username = EXCLUDED.username,
           text = EXCLUDED.text,
           created_at = EXCLUDED.created_at`,
      [comment.cid, postId, comment.username, comment.text, comment.create_time]
    );
  }
}

// Ambil postingan TikTok hari ini dan simpan ke DB
// Tambahkan parameter opsional: isManual, waClient, chatId
export async function fetchAndStoreTiktokContent(isManual = false, waClient = null, chatId = null) {
  const clients = await getEligibleTiktokClients();
  let totalKonten = 0;
  let kontenLinks = [];

  for (const client of clients) {
    const secUid = client.client_tiktok;
    let posts;
    try {
      const res = await axios.get(`https://${RAPIDAPI_HOST}/api/user/posts`, {
        params: { secUid, count: 35, cursor: 0 },
        headers: {
          'x-rapidapi-key': RAPIDAPI_KEY,
          'x-rapidapi-host': RAPIDAPI_HOST
        }
      });
      posts = res.data.data.itemList || [];
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

      // Fetch & save komentar
      let comments = [];
      try {
        const commentRes = await axios.get(`https://${RAPIDAPI_HOST}/api/item/comments`, {
          params: { itemId: post.id, count: 100, cursor: 0 },
          headers: {
            'x-rapidapi-key': RAPIDAPI_KEY,
            'x-rapidapi-host': RAPIDAPI_HOST
          }
        });
        comments = commentRes.data.comments || [];
      } catch (err) {
        console.error(`Komentar TikTok Error (post ${post.id}):`, err.response?.data || err.message);
      }

      // Mapping komentar
      const mappedComments = comments.map(comment => ({
        cid: comment.cid,
        username: comment.user?.unique_id || comment.user?.uniqueId || '',
        text: comment.text,
        create_time: comment.create_time
      }));
      await upsertTiktokComments(post.id, mappedComments);
    }
  }

  // Kirim rekap jika manual
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
