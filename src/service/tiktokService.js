import fetch from 'node-fetch'; // Pastikan sudah install: npm install node-fetch

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY; // Simpan di .env
const RAPIDAPI_HOST = "tiktok-api23.p.rapidapi.com";


export async function getTiktokSecUid(username) {
  const url = `https://${RAPIDAPI_HOST}/api/user/info?uniqueId=${encodeURIComponent(username)}`;
  const options = {
    method: 'GET',
    headers: {
      'x-rapidapi-key': RAPIDAPI_KEY,
      'x-rapidapi-host': RAPIDAPI_HOST
    }
  };
  try {
    const response = await fetch(url, options);
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`API Error: ${response.status}.\nDetail: ${errText}`);
    }
    const data = await response.json();
    console.log("HASIL API TikTok:", JSON.stringify(data, null, 2));
    const secUid = data?.userInfo?.user?.secUid;
    if (!secUid) throw new Error("secUid tidak ditemukan di response API.");
    return secUid;
  } catch (err) {
    throw new Error("Gagal ambil secUid TikTok: " + err.message);
  }
}
