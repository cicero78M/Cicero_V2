import axios from 'axios';
import pLimit from 'p-limit';
import * as tiktokPostModel from '../model/tiktokPostModel.js';
import * as tiktokCommentModel from '../model/tiktokCommentModel.js';
import { pool } from '../config/db.js';

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY_TIKTOK;
const RAPIDAPI_HOST = 'tiktok-api23.p.rapidapi.com';
const limit = pLimit(4);

// Ambil client yang punya TikTok aktif
async function getEligibleClients() {
  const res = await pool.query(
    `SELECT client_ID as id, client_tiktok FROM clients
      WHERE client_status=true AND client_tiktok_status=true AND client_tiktok IS NOT NULL`
  );
  return res.rows;
}

// Only post hari ini (asumsi field timestamp: created_at dari Tiktok UNIX time)
function isToday(unixTimestamp) {
  if (!unixTimestamp) return false;
  const d = new Date(unixTimestamp * 1000);
  const today = new Date();
  return d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate();
}

export async function fetchAndStoreTiktokContent() {
  const clients = await getEligibleClients();
  for (const client of clients) {
    const username = client.client_tiktok;
    // 1. FETCH video/posts Tiktok via API
    let postsRes;
    try {
      postsRes = await limit(() =>
        axios.get(
          `https://${RAPIDAPI_HOST}/user/posts/`,
          {
            params: { unique_id: username, count: 30 },
            headers: {
              'X-RapidAPI-Key': RAPIDAPI_KEY,
              'X-RapidAPI-Host': RAPIDAPI_HOST,
            },
          }
        )
      );
    } catch (err) {
      console.error("ERROR FETCHING TIKTOK POST:", err.response?.data || err.message);
      continue;
    }
    const items = postsRes.data && Array.isArray(postsRes.data.data) ? postsRes.data.data : [];
    for (const post of items) {
      if (!isToday(post.create_time)) continue;
      const video_id = post.aweme_id || post.id;
      await tiktokPostModel.upsertTiktokPost({
        client_id: client.id,
        video_id,
        caption: post.desc,
        created_at: post.create_time,
        comment_count: post.statistics?.comment_count || 0,
        like_count: post.statistics?.digg_count || 0
      });
      // 2. FETCH comments per video
      await limit(async () => {
        let commentRes;
        try {
          commentRes = await axios.get(
            `https://${RAPIDAPI_HOST}/video/comments/`,
            {
              params: { video_id, count: 100 },
              headers: {
                'X-RapidAPI-Key': RAPIDAPI_KEY,
                'X-RapidAPI-Host': RAPIDAPI_HOST,
              },
            }
          );
        } catch (e) {
          console.error('ERROR FETCH COMMENTS:', e.response?.data || e.message);
          return;
        }
        const comments = (commentRes.data?.data || [])
          .map(c => c.user?.unique_id || c.user?.nickname || c.username)
          .filter(Boolean);
        await tiktokCommentModel.upsertTiktokComment(video_id, comments);
      });
    }
  }
  return { message: 'Sukses fetch & simpan data Tiktok hari ini.' };
}
