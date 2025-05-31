import axios from "axios";
import { upsertTiktokComments } from "../model/tiktokCommentModel.js";
import pLimit from "p-limit";

const limit = pLimit(6); // <= Ubah sesuai kebutuhan paralel request

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Handler fetch komentar per videoId, gunakan di dalam limit()
export async function fetchTiktokCommentsByVideoId(videoId, retryCount = 0) {
  const options = {
    method: 'GET',
    url: 'https://tiktok-api23.p.rapidapi.com/api/post/comments',
    params: { videoId, count: '50', cursor: '0' },
    headers: {
      'x-rapidapi-key': process.env.RAPIDAPI_KEY, // .env, jangan hardcode!
      'x-rapidapi-host': 'tiktok-api23.p.rapidapi.com'
    }
  };

  try {
    console.log(`[FETCH TIKTOK KOMEN] videoId=${videoId} | Percobaan: ${retryCount + 1}`);
    const response = await axios.request(options);

    if (response?.data?.data) {
      console.log(`[FETCH KOMEN OK][${videoId}] Jumlah komentar: ${response.data.data.comments?.length || 0}`);
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

    if (status === 429) {
      const delay = 65000;
      if (retryCount < 2) {
        console.warn(`[RATE LIMIT][${videoId}] Kena limit, retry setelah ${delay / 1000} detik...`);
        await sleep(delay);
        return fetchTiktokCommentsByVideoId(videoId, retryCount + 1);
      } else {
        console.error(`[RATE LIMIT][${videoId}] Retry sudah 3x, skip.`);
      }
    }
    return [];
  }
}

