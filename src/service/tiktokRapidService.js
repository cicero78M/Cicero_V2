import axios from 'axios';
import { fetchTiktokSecUid } from './clientService.js';
import { env } from '../config/env.js';

const COMMENT_PAGE_MAX_RETRIES = 3;
const COMMENT_PAGE_BASE_DELAY_MS = 500;
const RETRYABLE_ERROR_CODES = new Set([
  'ECONNRESET',
  'ETIMEDOUT',
  'EAI_AGAIN',
  'ECONNABORTED',
  'ENOTFOUND'
]);

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isRetryableError(err) {
  if (!err) return false;
  if (!err.response) return true;
  if (err.response?.status >= 500) return true;
  if (err.code && RETRYABLE_ERROR_CODES.has(err.code)) return true;
  return false;
}

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

function parsePostDetail(resData) {
  let payload = resData?.data ?? resData;
  if (typeof payload === 'string') {
    try {
      payload = JSON.parse(payload);
    } catch (err) {
      payload = {};
    }
  }

  if (payload?.itemInfo?.itemStruct) return payload.itemInfo.itemStruct;
  if (payload?.data?.itemInfo?.itemStruct) return payload.data.itemInfo.itemStruct;
  if (payload?.itemStruct) return payload.itemStruct;
  if (payload?.itemInfo?.item) return payload.itemInfo.item;
  return null;
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
      secUid: data.user?.secUid,
      nickname: data.user?.nickname,
      follower_count: data.stats?.followerCount,
      following_count: data.stats?.followingCount,
      like_count: data.stats?.heart,
      video_count: data.stats?.videoCount,
      avatar_url: data.user?.avatarThumb,
      verified: Boolean(data.user?.verified)
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

export async function fetchTiktokCommentsPage(videoId, cursor = 0, count = 50) {
  if (!videoId) return { comments: [], next_cursor: null, total: null };

  for (let attempt = 1; attempt <= COMMENT_PAGE_MAX_RETRIES; attempt++) {
    try {
      const res = await axios.get(`https://${RAPIDAPI_HOST}/api/post/comments`, {
        params: { videoId, count: String(count), cursor: String(cursor) },
        headers: {
          'X-RapidAPI-Key': RAPIDAPI_KEY,
          'X-RapidAPI-Host': RAPIDAPI_HOST,
          'x-cache-control': 'no-cache'
        }
      });
      let comments = [];
      let total = null;
      const data = res.data;
      if (Array.isArray(data?.data?.comments)) {
        comments = data.data.comments;
        if (typeof data.data.total === 'number') total = data.data.total;
      } else if (Array.isArray(data?.comments)) {
        comments = data.comments;
        if (typeof data.total === 'number') total = data.total;
      }
      const next_cursor = cursor + count;
      const has_more = comments.length > 0 && (total === null || next_cursor <= total);
      return { comments, next_cursor: has_more ? next_cursor : null, total };
    } catch (err) {
      const shouldRetry = attempt < COMMENT_PAGE_MAX_RETRIES && isRetryableError(err);
      if (shouldRetry) {
        const waitMs = COMMENT_PAGE_BASE_DELAY_MS * 2 ** (attempt - 1);
        await delay(waitMs);
        continue;
      }
      const msg = err.response?.data ? JSON.stringify(err.response.data) : err.message;
      const error = new Error(msg);
      error.statusCode = err.response?.status;
      throw error;
    }
  }
}

export async function fetchTiktokPostDetail(videoId) {
  if (!videoId) {
    throw new Error('Parameter videoId wajib diisi.');
  }

  try {
    const res = await axios.get(`https://${RAPIDAPI_HOST}/api/post/detail`, {
      params: { videoId },
      headers: {
        'X-RapidAPI-Key': RAPIDAPI_KEY,
        'X-RapidAPI-Host': RAPIDAPI_HOST,
        'x-cache-control': 'no-cache'
      }
    });

    const itemStruct = parsePostDetail(res.data);
    if (!itemStruct) {
      throw new Error('Response detail TikTok tidak memiliki itemStruct.');
    }

    return itemStruct;
  } catch (err) {
    const msg = err.response?.data
      ? JSON.stringify(err.response.data)
      : err.message;
    const error = new Error(msg);
    error.statusCode = err.response?.status;
    throw error;
  }
}

export async function fetchAllTiktokComments(videoId) {
  const all = [];
  let cursor = 0;
  let total = null;
  while (true) {
    const { comments, next_cursor, total: tot } = await fetchTiktokCommentsPage(videoId, cursor);
    if (tot !== null) total = tot;
    if (!comments.length) break;
    all.push(...comments);
    if (!next_cursor) break;
    cursor = next_cursor;
    await new Promise(r => setTimeout(r, 2000));
  }
  return all;
}
