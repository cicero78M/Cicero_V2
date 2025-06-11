// src/controller/instaController.js
import { getRekapLikesByClient } from "../model/instaLikeModel.js";
import * as instaPostService from "../service/instaPostService.js";
import { fetchInstagramPosts, fetchInstagramProfile, fetchInstagramInfo } from "../service/instaRapidService.js";
import { sendSuccess } from "../utils/response.js";

export async function getInstaRekapLikes(req, res) {
  const client_id = req.query.client_id;
  const periode = req.query.periode || "harian";
  if (!client_id) {
    return res.status(400).json({ success: false, message: "client_id wajib diisi" });
  }
  try {
    const data = await getRekapLikesByClient(client_id, periode);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

export async function getInstaPosts(req, res) {
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

    const posts = await instaPostService.findByClientId(client_id);
    sendSuccess(res, posts);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

export async function getRapidInstagramPosts(req, res) {
  try {
    const username = req.query.username;
    let limit = parseInt(req.query.limit);
    if (Number.isNaN(limit) || limit <= 0) limit = 10;
    if (!username) {
      return res.status(400).json({ success: false, message: 'username wajib diisi' });
    }
    const rawPosts = await fetchInstagramPosts(username, limit);
    const posts = rawPosts.map(p => ({
      id: p.code || p.id || p.pk,
      created_at: p.taken_at ? new Date(p.taken_at * 1000).toISOString() : p.created_at,
      type: p.media_type || p.type,
      caption: p.caption && typeof p.caption === 'object' ? p.caption.text : p.caption,
      like_count: p.like_count,
      comment_count: p.comment_count,
      share_count: p.share_count,
      thumbnail: p.thumbnail || p.display_url
    }));
    sendSuccess(res, posts);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

export async function getRapidInstagramProfile(req, res) {
  try {
    const username = req.query.username;
    if (!username) {
      return res.status(400).json({ success: false, message: 'username wajib diisi' });
    }
    const profile = await fetchInstagramProfile(username);
    sendSuccess(res, profile);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

export async function getRapidInstagramInfo(req, res) {
  try {
    const username = req.query.username;
    if (!username) {
      return res.status(400).json({ success: false, message: 'username wajib diisi' });
    }
    const info = await fetchInstagramInfo(username);
    sendSuccess(res, info);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}
