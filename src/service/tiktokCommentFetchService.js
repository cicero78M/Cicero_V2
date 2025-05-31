import axios from "axios";
import { upsertTiktokComments } from "../model/tiktokCommentModel.js";
import pLimit from "p-limit";

const limit = pLimit(6); // Sesuaikan paralel request

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetch dan upsert komentar TikTok (by videoId) ke database.
 * Retry otomatis jika kena rate limit atau network error.
 * @param {string} videoId - ID video TikTok
 * @param {number} retryCount - Jumlah percobaan (default 0)
 * @returns {Promise<Array<string>>} - Array username yang komentar
 */
export async function fetchTiktokCommentsByVideoId(videoId, retryCount = 0) {
  const MAX_RETRY = 3;
  const RETRY_DELAY_MS = 65000; // 65 detik jika rate limit

  const options = {
    method: 'GET',
    url: 'https://tiktok-api23.p.rapidapi.com/api/post/comments',
    params: { videoId, count: '50', cursor: '0' },
    headers: {
      'x-rapidapi-key': process.env.RAPIDAPI_KEY,
      'x-rapidapi-host': 'tiktok-api23.p.rapidapi.com'
    }
  };

  try {
    console.log(`[FETCH TIKTOK KOMEN] videoId=${videoId} | Percobaan ke-${retryCount + 1}`);
    const response = await axios.request(options);

    if (response?.data?.data) {
      console.log(`[FETCH KOMEN OK][${videoId}] Jumlah komentar: ${response.data.data.comments?.length || 0}`);
      // Untuk debug, tampilkan hanya max 300 karakter data mentah
      console.log(`[DEBUG KOMEN RAW][${videoId}]`, JSON.stringify(response.data.data).substring(0, 300) + '...');
    } else {
      console.log(`[FETCH KOMEN][${videoId}] Tidak ada data.comments pada response API`);
    }

    let comments = [];
    if (response.data?.data?.comments) {
      comments = response.data.data.comments.map(c => c.user?.unique_id).filter(Boolean);
    }

    await upsertTiktokComments(videoId, comments);
    console.log(`[UPSERT KOMEN][${videoId}] Sukses simpan komentar: ${comments.length} user`);
    return comments;

  } catch (e) {
    const status = e?.response?.status || 0;
    const body = e?.response?.data || e.message;

    console.error(`[TIKTOK API ERROR][videoId=${videoId}] [status=${status}]`, body);

    // Jika rate limit 429, retry (max 3x)
    if (status === 429) {
      if (retryCount < MAX_RETRY) {
        const delay = RETRY_DELAY_MS;
        console.warn(`[RATE LIMIT][${videoId}] Kena limit, retry ke-${retryCount + 2} setelah ${delay / 1000}s...`);
        await sleep(delay);
        return fetchTiktokCommentsByVideoId(videoId, retryCount + 1);
      } else {
        console.error(`[RATE LIMIT][${videoId}] Retry sudah ${MAX_RETRY}x, skip.`);
        return [];
      }
    }

    // Jika network error/timeout, retry juga (max 3x)
    if (!e.response && retryCount < MAX_RETRY) {
      const delay = 10000; // 10 detik jika network error
      console.warn(`[NETWORK ERROR][${videoId}] Retry ke-${retryCount + 2} setelah ${delay / 1000}s...`);
      await sleep(delay);
      return fetchTiktokCommentsByVideoId(videoId, retryCount + 1);
    }

    // Jika error lain, jangan retry, return []
    return [];
  }
}
