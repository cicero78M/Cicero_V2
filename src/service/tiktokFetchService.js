import axios from 'axios';
import * as tiktokPostModel from '../model/tiktokPostModel.js';
import * as tiktokCommentModel from '../model/tiktokCommentModel.js';
import { pool } from '../config/db.js';

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const RAPIDAPI_HOST = 'tiktok-api23.p.rapidapi.com';

// Helper: filter hanya hari ini (UNIX seconds)
function isToday(unix) {
  if (!unix) return false;
  const d = new Date(unix * 1000);
  const today = new Date();
  return d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate();
}

// Ambil semua client yang TikTok aktif
async function getEligibleClients() {
  const res = await pool.query(
    `SELECT client_id, tiktok_secUid FROM client WHERE client_status = true AND client_tiktok_status = true AND tiktok_secUid IS NOT NULL`
  );
  return res.rows;
}

export async function fetchAndStoreTiktokContent() {
  const clients = await getEligibleClients();
  for (const client of clients) {
    const secUid = client.tiktok_secuid;
    let postsRes;
    try {
      postsRes = await axios.get(
        `https://${RAPIDAPI_HOST}/api/user/posts`,
        {
          params: { secUid, count: 35, cursor: 0 },
          headers: {
            'x-rapidapi-key': RAPIDAPI_KEY,
            'x-rapidapi-host': RAPIDAPI_HOST
          }
        }
      );
    } catch (err) {
      console.error('[TikTok Fetch ERROR]', err.response?.data || err.message);
      continue;
    }
    const items = postsRes.data?.data?.items ?? [];
    for (const post of items) {
      if (!isToday(post.createTime)) continue;
      const toSave = {
        video_id: post.id,
        client_id: client.client_id,
        desc: post.desc,
        created_at: post.createTime,
        comment_count: post.commentCount,
        like_count: post.diggCount,
        share_count: post.shareCount
      };
      await tiktokPostModel.upsertTiktokPost(toSave);

      // Fetch comments
      let commRes;
      try {
        commRes = await axios.get(
          `https://${RAPIDAPI_HOST}/api/post/comments`,
          {
            params: { awemeId: post.id },
            headers: {
              'x-rapidapi-key': RAPIDAPI_KEY,
              'x-rapidapi-host': RAPIDAPI_HOST
            }
          }
        );
      } catch (err) {
        console.error('[TikTok Comments ERROR]', err.response?.data || err.message);
        continue;
      }
      const usernames = commRes.data?.data?.comments?.map(c => c.user?.unique_id) ?? [];
      await tiktokCommentModel.upsertTiktokComment(post.id, usernames);
    }
  }
}
