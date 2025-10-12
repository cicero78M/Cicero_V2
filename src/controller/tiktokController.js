import * as tiktokPostService from '../service/tiktokPostService.js';
import * as tiktokCommentService from '../service/tiktokCommentService.js';
import * as clientService from '../service/clientService.js';
import { sendSuccess } from '../utils/response.js';
import {
  fetchTiktokProfile,
  fetchTiktokPosts,
  fetchTiktokPostsBySecUid,
  fetchTiktokInfo
} from '../service/tiktokApi.js';
import * as profileCache from '../service/profileCacheService.js';

const TIKTOK_PROFILE_URL_REGEX =
  /^https?:\/\/(www\.)?tiktok\.com\/@([A-Za-z0-9._]+)\/?(\?.*)?$/i;

export function normalizeTikTokUsername(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const match = trimmed.match(TIKTOK_PROFILE_URL_REGEX);
  const username = match ? match[2] : trimmed.replace(/^@/, '');
  const normalized = username?.toLowerCase();
  if (!normalized || !/^[a-z0-9._]{1,24}$/.test(normalized)) {
    return null;
  }
  return normalized;
}

export async function getTiktokComments(req, res, next) {
  try {
    const client_id =
      req.query.client_id ||
      req.user?.client_id ||
      req.headers['x-client-id'];
    if (!client_id) {
      return res
        .status(400)
        .json({ success: false, message: 'client_id wajib diisi' });
    }

    const posts = await tiktokPostService.findByClientId(client_id);
    let commentsData = [];
    for (const post of posts) {
      const comm = await tiktokCommentService.findByVideoId(post.video_id);
      commentsData.push({
        video_id: post.video_id,
        comment_count: Array.isArray(comm?.comments) ? comm.comments.length : 0,
        comments: comm?.comments || [],
      });
    }
    sendSuccess(res, commentsData);
  } catch (err) {
    next(err);
  }
}

export async function getTiktokPosts(req, res) {
  try {
    const client_id =
      req.query.client_id ||
      req.user?.client_id ||
      req.headers["x-client-id"];
    if (!client_id) {
      return res
        .status(400)
        .json({ success: false, message: "client_id wajib diisi" });
    }

    const posts = await tiktokPostService.findByClientId(client_id);
    sendSuccess(res, posts);
  } catch (err) {
    const code = err.statusCode || err.response?.status || 500;
    res.status(code).json({ success: false, message: err.message });
  }
}

import { getRekapKomentarByClient } from '../model/tiktokCommentModel.js';

export async function getTiktokRekapKomentar(req, res) {
  const client_id = 'DITBINMAS';
  const periode = req.query.periode || 'harian';
  const tanggal = req.query.tanggal;
  const startDate = req.query.start_date || req.query.tanggal_mulai;
  const endDate = req.query.end_date || req.query.tanggal_selesai;
  try {
    const role = req.user?.role;
    const data = await getRekapKomentarByClient(
      client_id,
      periode,
      tanggal,
      startDate,
      endDate,
      role
    );
    const length = Array.isArray(data) ? data.length : 0;
    const chartHeight = Math.max(length * 30, 300);
    const usersWithComments = data
      .filter((u) => u.jumlah_komentar > 0)
      .map((u) => u.username);
    const usersWithoutComments = data
      .filter((u) => u.jumlah_komentar === 0)
      .map((u) => u.username);
    res.json({
      success: true,
      data,
      chartHeight,
      usersWithComments,
      usersWithoutComments,
      usersWithCommentsCount: usersWithComments.length,
      usersWithoutCommentsCount: usersWithoutComments.length,
      usersCount: length,
    });
  } catch (err) {
    const code = err.statusCode || err.response?.status || 500;
    res.status(code).json({ success: false, message: err.message });
  }
}


export async function getRapidTiktokProfile(req, res) {
  try {
    const username = req.query.username;
    if (!username) {
      return res.status(400).json({ success: false, message: 'username wajib diisi' });
    }
    const normalizedUsername = normalizeTikTokUsername(username);
    if (!normalizedUsername) {
      return res.status(400).json({
        success: false,
        message:
          'Format username TikTok tidak valid. Gunakan tautan profil atau username seperti tiktok.com/@username atau @username.'
      });
    }
    let profile = await profileCache.getProfile('tiktok', normalizedUsername);
    if (!profile) {
      profile = await fetchTiktokProfile(normalizedUsername);
      if (profile) {
        await profileCache.setProfile('tiktok', normalizedUsername, profile);
      }
    }
    sendSuccess(res, profile);
  } catch (err) {
    const code = err.statusCode || err.response?.status || 500;
    res.status(code).json({ success: false, message: err.message });
  }
}

export async function getRapidTiktokInfo(req, res) {
  try {
    const client_id =
      req.query.client_id ||
      req.user?.client_id ||
      req.headers['x-client-id'];
    if (!client_id) {
      return res
        .status(400)
        .json({ success: false, message: 'client_id wajib diisi' });
    }
    const client = await clientService.findClientById(client_id);
    const username = client?.client_tiktok;
    if (!username) {
      return res
        .status(404)
        .json({ success: false, message: 'Username TikTok tidak ditemukan' });
    }
    const info = await fetchTiktokInfo(username);
    sendSuccess(res, info);
  } catch (err) {
    const code = err.statusCode || err.response?.status || 500;
    res.status(code).json({ success: false, message: err.message });
  }
}

export async function getRapidTiktokPosts(req, res) {
  try {
    const client_id =
      req.query.client_id ||
      req.user?.client_id ||
      req.headers['x-client-id'];
    let { username, secUid } = req.query;
    let limit = parseInt(req.query.limit);
    if (Number.isNaN(limit) || limit <= 0) limit = 10;
    else if (limit > 100) limit = 100;

    if (!username && !secUid) {
      if (!client_id) {
        return res.status(400).json({ success: false, message: 'client_id wajib diisi' });
      }
      const client = await clientService.findClientById(client_id);
      username = client?.client_tiktok;
      secUid = client?.tiktok_secuid || secUid;
    }

    if (username) {
      const normalizedUsername = normalizeTikTokUsername(username);
      if (!normalizedUsername) {
        return res.status(400).json({
          success: false,
          message:
            'Format username TikTok tidak valid. Gunakan tautan profil atau username seperti tiktok.com/@username atau @username.'
        });
      }
      username = normalizedUsername;
    }

    if (!username && !secUid) {
      return res.status(404).json({ success: false, message: 'Username TikTok tidak ditemukan' });
    }

    const posts = secUid
      ? await fetchTiktokPostsBySecUid(secUid, limit)
      : await fetchTiktokPosts(username, limit);
    sendSuccess(res, posts);
  } catch (err) {
    const code = err.statusCode || err.response?.status || 500;
    res.status(code).json({ success: false, message: err.message });
  }
}
