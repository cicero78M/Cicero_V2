import axios from 'axios';
import { fetchTiktokSecUid } from './clientService.js';
import { env } from '../config/env.js';

const RAPIDAPI_KEY = env.RAPIDAPI_KEY;
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
  try {
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
  } catch (err) {
    const msg = err.response?.data
      ? JSON.stringify(err.response.data)
      : err.message;
    const error = new Error(msg);
    error.statusCode = err.response?.status;
    throw error;
  }
}

export async function fetchTiktokInfo(username) {
  if (!username) return null;
  try {
    const res = await axios.get(`https://${RAPIDAPI_HOST}/api/user/info`, {
      params: { uniqueId: username.replace(/^@/, '') },
      headers: {
        'X-RapidAPI-Key': RAPIDAPI_KEY,
        'X-RapidAPI-Host': RAPIDAPI_HOST,
        'x-cache-control': 'no-cache'
      }
    });
    return res.data || null;
  } catch (err) {
    const msg = err.response?.data
      ? JSON.stringify(err.response.data)
      : err.message;
    const error = new Error(msg);
    error.statusCode = err.response?.status;
    throw error;
  }
}

export async function fetchTiktokPosts(username, limit = 10) {
  if (!username) return [];
  try {
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
  } catch (err) {
    const msg = err.response?.data || err.message;
    if (typeof msg === 'object' && /missing required params/i.test(msg.error || '')) {
      try {
        const secUid = await fetchTiktokSecUid(username);
        if (secUid) {
          return await fetchTiktokPostsBySecUid(secUid, limit);
        }
      } catch {}
    }
    const error = new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
    error.statusCode = err.response?.status;
    throw error;
  }
}

export async function fetchTiktokPostsBySecUid(secUid, limit = 10) {
  if (!secUid) return [];
  try {
    const res = await axios.get(`https://${RAPIDAPI_HOST}/api/user/posts`, {
      params: {
        secUid,
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
  } catch (err) {
    const msg = err.response?.data
      ? JSON.stringify(err.response.data)
      : err.message;
    const error = new Error(msg);
    error.statusCode = err.response?.status;
    throw error;
  }
}
