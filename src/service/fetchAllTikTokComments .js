// src/service/fetchAllTikTokComments.js
import axios from 'axios';
import { pool } from '../config/db.js';
import * as tiktokCommentModel from '../model/tiktokCommentModel.js';
import { getPostsTodayByClient } from '../model/tiktokPostModel.js';
import { findAll } from '../model/clientModel.js';

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const RAPIDAPI_HOST = 'tiktok-api23.p.rapidapi.com';

// Helper: delay supaya tidak ke rate-limit
function sleep(ms) {
  return new Promise(res => setTimeout(res, ms));
}

// Fetch semua komentar satu video (pagination/cursor TikTok)
async function fetchAllCommentsForVideo(videoId, maxPage = 20) {
  let allComments = [];
  let cursor = 0;
  let hasMore = true;
  let page = 0;
  while (hasMore && page < maxPage) {
    try {
      const res = await axios.get(`https://${RAPIDAPI_HOST}/api/post/comments`, {
        params: { videoId, count: 100, cursor },
        headers: {
          'x-rapidapi-key': RAPIDAPI_KEY,
          'x-rapidapi-host': RAPIDAPI_HOST
        }
      });
      const data = res.data;
      const comments = (data.comments || []).map(c => c.user?.unique_id).filter(Boolean);
      allComments.push(...comments);
      hasMore = !!(data.has_more || data.hasMore || data.next_cursor);
      cursor = data.next_cursor || data.cursor || 0;
      if (!hasMore || comments.length === 0) break;
      await sleep(800); // delay antar page
      page++;
    } catch (e) {
      console.log(`[ERROR] Fetch komentar video ${videoId}: ${e.message}`);
      break;
    }
  }
  // Remove duplicates
  allComments = Array.from(new Set(allComments));
  return allComments;
}

// Fungsi utama fetch komentar hari ini untuk seluruh client aktif
export async function fetchAllTikTokCommentsToday() {
  const clients = await findAll();
  let report = [];
  for (const client of clients) {
    if (!client.client_status || !client.client_tiktok || !client.tiktok_secuid) continue;
    const posts = await getPostsTodayByClient(client.client_id);
    let clientResult = {
      client_id: client.client_id,
      total_post: posts.length,
      total_komentar: 0,
      detail: []
    };
    for (const post of posts) {
      const video_id = post.video_id || post.id;
      if (!video_id) continue;
      const comments = await fetchAllCommentsForVideo(video_id);
      await tiktokCommentModel.upsertTiktokComments(video_id, comments);
      clientResult.detail.push({
        video_id,
        komentar: comments.length
      });
      clientResult.total_komentar += comments.length;
      console.log(`[${client.client_id}] ${video_id} - ${comments.length} komentar`);
      await sleep(1200); // delay antar video untuk safety
    }
    report.push(clientResult);
    await sleep(2000); // delay antar client
  }
  console.log('=== Fetch ALL TikTok Comments Selesai ===');
  console.dir(report, { depth: 5 });
  return report;
}

// Eksekusi langsung via node (opsional untuk test manual)
if (import.meta.url === `file://${process.argv[1]}`) {
  fetchAllTikTokCommentsToday()
    .then(() => process.exit(0))
    .catch(e => { console.error(e); process.exit(1); });
}
