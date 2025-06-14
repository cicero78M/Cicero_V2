import * as tiktokPostService from '../service/tiktokPostService.js';
import * as tiktokCommentService from '../service/tiktokCommentService.js';
import * as clientService from '../service/clientService.js';
import { sendSuccess } from '../utils/response.js';
import {
  fetchTiktokProfile,
  fetchTiktokPosts,
  fetchTiktokPostsBySecUid,
  fetchTiktokInfo
} from '../service/tiktokRapidService.js';

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
  const client_id = req.query.client_id;
  const periode = req.query.periode || 'harian';
  if (!client_id) {
    return res.status(400).json({ success: false, message: 'client_id wajib diisi' });
  }
  try {
    const data = await getRekapKomentarByClient(client_id, periode);
    res.json({ success: true, data });
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
    const profile = await fetchTiktokProfile(username);
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

    if (!username && !secUid) {
      if (!client_id) {
        return res.status(400).json({ success: false, message: 'client_id wajib diisi' });
      }
      const client = await clientService.findClientById(client_id);
      username = client?.client_tiktok;
      secUid = client?.tiktok_secuid || secUid;
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
