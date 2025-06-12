import * as tiktokPostService from '../service/tiktokPostService.js';
import * as tiktokCommentService from '../service/tiktokCommentService.js';
import { sendSuccess } from '../utils/response.js';
import { fetchTiktokProfile, fetchTiktokPosts, fetchTiktokInfo } from '../service/tiktokRapidService.js';

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
    res.status(500).json({ success: false, message: err.message });
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
    res.status(500).json({ success: false, message: err.message });
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
    res.status(500).json({ success: false, message: err.message });
  }
}

export async function getRapidTiktokInfo(req, res) {
  try {
    const username = req.query.username;
    if (!username) {
      return res.status(400).json({ success: false, message: 'username wajib diisi' });
    }
    const info = await fetchTiktokInfo(username);
    sendSuccess(res, info);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

export async function getRapidTiktokPosts(req, res) {
  try {
    const username = req.query.username;
    let limit = parseInt(req.query.limit);
    if (Number.isNaN(limit) || limit <= 0) limit = 10;
    if (!username) {
      return res.status(400).json({ success: false, message: 'username wajib diisi' });
    }
    const posts = await fetchTiktokPosts(username, limit);
    sendSuccess(res, posts);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}
