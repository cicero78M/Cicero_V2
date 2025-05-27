import fetch from 'node-fetch'; // Pastikan sudah install: npm install node-fetch

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY; // Simpan di .env
const RAPIDAPI_HOST = "tiktok-api23.p.rapidapi.com";

export async function getTiktokSecUid(username) {
  const url = `https://tiktok-api23.p.rapidapi.com/user_info_v2?username=${encodeURIComponent(username)}`;
  const options = {
    method: 'GET',
    headers: {
      'X-RapidAPI-Key': RAPIDAPI_KEY,
      'X-RapidAPI-Host': RAPIDAPI_HOST
    }
  };
  try {
    const response = await fetch(url, options);
    if (!response.ok) throw new Error(`API Error: ${response.status}`);
    const data = await response.json();

    // Cek struktur JSON response dari API
    // Path: response.data.userInfo.user.secUid
    const secUid = data?.data?.userInfo?.user?.secUid;
    if (!secUid) throw new Error("secUid tidak ditemukan di response API.");
    return secUid;
  } catch (err) {
    throw new Error("Gagal ambil secUid TikTok: " + err.message);
  }
}
