import axios from 'axios';

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const RAPIDAPI_HOST = 'tiktok-api23.p.rapidapi.com';

function parsePosts(resData) {
  let dataObj = resData?.data?.data || resData?.data?.result || resData?.data;
  if (typeof dataObj === 'string') {
    try {
      dataObj = JSON.parse(dataObj);
    } catch (e) {
      dataObj = {};
    }
  }
  if (Array.isArray(dataObj.itemList)) return dataObj.itemList;
  if (Array.isArray(dataObj.items)) return dataObj.items;
  if (Array.isArray(resData?.data?.result?.videos)) return resData.data.result.videos;
  if (Array.isArray(dataObj.videos)) return dataObj.videos;
  return [];
}

export async function fetchTiktokProfile(username) {
  if (!username) return null;
  const res = await axios.get(`https://${RAPIDAPI_HOST}/api/user/info`, {
    params: { uniqueId: username.replace(/^@/, '') },
    headers: {
      'X-RapidAPI-Key': RAPIDAPI_KEY,
      'X-RapidAPI-Host': RAPIDAPI_HOST,
      'x-cache-control': 'no-cache'
    }
  });
  const data = res.data?.userInfo;
  if (!data) return res.data;
  return {
    username: data.user?.uniqueId,
    nickname: data.user?.nickname,
    follower_count: data.stats?.followerCount,
    following_count: data.stats?.followingCount,
    like_count: data.stats?.heart,
    video_count: data.stats?.videoCount,
    avatar_url: data.user?.avatarThumb
  };
}

export async function fetchTiktokPosts(username, limit = 10) {
  if (!username) return [];
  const res = await axios.get(`https://${RAPIDAPI_HOST}/api/user/posts`, {
    params: {
      uniqueId: username.replace(/^@/, ''),
      count: String(limit > 0 ? limit : 10),
      cursor: '0'
    },
    headers: {
      'X-RapidAPI-Key': RAPIDAPI_KEY,
      'X-RapidAPI-Host': RAPIDAPI_HOST,
      'x-cache-control': 'no-cache'
    }
  });
  const items = parsePosts(res);
  return limit ? items.slice(0, limit) : items;
}
