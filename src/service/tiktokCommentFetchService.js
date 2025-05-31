import axios from "axios";
import { upsertTiktokComments } from "../model/tiktokCommentModel.js";

// Helper fetch komentar TikTok dari API dan simpan ke DB
export async function fetchTiktokCommentsByVideoId(videoId) {
  const options = {
    method: 'GET',
    url: 'https://tiktok-api23.p.rapidapi.com/api/post/comments',
    params: { videoId, count: '50', cursor: '0' },
    headers: {
      'x-rapidapi-key': process.env.RAPIDAPI_KEY, // .env, **jangan hardcode!**
      'x-rapidapi-host': 'tiktok-api23.p.rapidapi.com'
    }
  };
  try {
    const response = await axios.request(options);
    // Hasil sesuai contoh file yang kamu upload
    let comments = [];
    if (response.data?.data?.comments) {
      comments = response.data.data.comments.map(c => c.user?.unique_id).filter(Boolean);
    }
    await upsertTiktokComments(videoId, comments);
    return comments;
  } catch (e) {
    console.error(`[TIKTOK API ERROR][videoId=${videoId}]`, e?.response?.data || e.message);
    return [];
  }
}
