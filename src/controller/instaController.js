// src/controller/instaController.js
import { getRekapLikesByClient } from "../model/instaLikeModel.js";
import * as instaPostService from "../service/instaPostService.js";
import { fetchInstagramPosts, fetchInstagramProfile, fetchInstagramInfo, fetchInstagramPostsByMonthToken } from "../service/instaRapidService.js";
import * as instaProfileService from "../service/instaProfileService.js";
import * as instaPostCacheService from "../service/instaPostCacheService.js";
import { sendSuccess } from "../utils/response.js";
import { sendConsoleDebug } from "../middleware/debugHandler.js";

export async function getInstaRekapLikes(req, res) {
  const client_id = req.query.client_id;
  const periode = req.query.periode || "harian";
  if (!client_id) {
    return res.status(400).json({ success: false, message: "client_id wajib diisi" });
  }
  try {
    sendConsoleDebug({ tag: "INSTA", msg: `getInstaRekapLikes ${client_id} ${periode}` });
    const data = await getRekapLikesByClient(client_id, periode);
    res.json({ success: true, data });
  } catch (err) {
    sendConsoleDebug({ tag: "INSTA", msg: `Error getInstaRekapLikes: ${err.message}` });
    const code = err.statusCode || err.response?.status || 500;
    res.status(code).json({ success: false, message: err.message });
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

    sendConsoleDebug({ tag: "INSTA", msg: `getInstaPosts ${client_id}` });
    const posts = await instaPostService.findByClientId(client_id);
    sendSuccess(res, posts);
  } catch (err) {
    sendConsoleDebug({ tag: "INSTA", msg: `Error getInstaPosts: ${err.message}` });
    const code = err.statusCode || err.response?.status || 500;
    res.status(code).json({ success: false, message: err.message });
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

    sendConsoleDebug({ tag: "INSTA", msg: `getRapidInstagramPosts ${username} ${limit}` });

    const rawPosts = await fetchInstagramPosts(username, limit);
    const posts = rawPosts.map(p => {
      const thumbnail =
        p.thumbnail_url ||
        p.thumbnail_src ||
        p.thumbnail ||
        p.display_url ||
        (p.image_versions?.items?.[0]?.url) ||
        (p.image_versions2?.candidates?.[0]?.url);
      return {
        id: p.code || p.id || p.pk,
        created_at: p.taken_at ? new Date(p.taken_at * 1000).toISOString() : p.created_at,
        type: p.media_type || p.type,
        caption: p.caption && typeof p.caption === 'object' ? p.caption.text : p.caption,
        like_count: p.like_count,
        comment_count: p.comment_count,
        share_count: p.share_count,
        view_count:
          p.play_count ??
          p.view_count ??
          p.playCount ??
          p.viewCount ??
          p.video_view_count ??
        0,
        thumbnail
      };
    });
    sendSuccess(res, posts);
  } catch (err) {
    sendConsoleDebug({ tag: "INSTA", msg: `Error getRapidInstagramPosts: ${err.message}` });
    const code = err.statusCode || err.response?.status || 500;
    res.status(code).json({ success: false, message: err.message });
  }
}

export async function getRapidInstagramPostsStore(req, res) {
  try {
    const username = req.query.username;
    let limit = parseInt(req.query.limit);
    if (Number.isNaN(limit) || limit <= 0) limit = 10;
    if (!username) {
      return res.status(400).json({ success: false, message: 'username wajib diisi' });
    }
    sendConsoleDebug({ tag: "INSTA", msg: `getRapidInstagramPostsStore ${username} ${limit}` });
    const rawPosts = await fetchInstagramPosts(username, limit);
    const posts = rawPosts.map(p => {
      const thumbnail =
        p.thumbnail_url ||
        p.thumbnail_src ||
        p.thumbnail ||
        p.display_url ||
        (p.image_versions?.items?.[0]?.url) ||
        (p.image_versions2?.candidates?.[0]?.url);
      return {
        id: p.code || p.id || p.pk,
        created_at: p.taken_at ? new Date(p.taken_at * 1000).toISOString() : p.created_at,
        type: p.media_type || p.type,
        caption: p.caption && typeof p.caption === 'object' ? p.caption.text : p.caption,
        like_count: p.like_count,
        comment_count: p.comment_count,
        share_count: p.share_count,
        view_count:
          p.play_count ??
          p.view_count ??
          p.playCount ??
          p.viewCount ??
          p.video_view_count ??
          0,
        thumbnail
      };
    });
    await instaPostCacheService.insertCache(username, posts);
    sendSuccess(res, posts);
  } catch (err) {
    sendConsoleDebug({ tag: "INSTA", msg: `Error getRapidInstagramPostsStore: ${err.message}` });
    const code = err.statusCode || err.response?.status || 500;
    res.status(code).json({ success: false, message: err.message });
  }
}

export async function getRapidInstagramPostsByMonth(req, res) {
  try {
    const username = req.query.username;
    const month = req.query.month;
    const year = req.query.year;
    if (!username) {
      return res.status(400).json({ success: false, message: 'username wajib diisi' });
    }

    sendConsoleDebug({ tag: "INSTA", msg: `getRapidInstagramPostsByMonth ${username} ${month}-${year}` });

    const rawPosts = await fetchInstagramPostsByMonthToken(username, month, year);
    const posts = rawPosts.map(p => {
      const thumbnail =
        p.thumbnail_url ||
        p.thumbnail_src ||
        p.thumbnail ||
        p.display_url ||
        (p.image_versions?.items?.[0]?.url) ||
        (p.image_versions2?.candidates?.[0]?.url);
      return {
        id: p.code || p.id || p.pk,
        created_at: p.taken_at ? new Date(p.taken_at * 1000).toISOString() : p.created_at,
        type: p.media_type || p.type,
        caption: p.caption && typeof p.caption === 'object' ? p.caption.text : p.caption,
        like_count: p.like_count,
        comment_count: p.comment_count,
        share_count: p.share_count,
        view_count:
          p.play_count ??
          p.view_count ??
          p.playCount ??
          p.viewCount ??
          p.video_view_count ??
          0,
        thumbnail
      };
    });
    sendSuccess(res, posts);
  } catch (err) {
    sendConsoleDebug({ tag: "INSTA", msg: `Error getRapidInstagramPostsByMonth: ${err.message}` });
    const code = err.statusCode || err.response?.status || 500;
    res.status(code).json({ success: false, message: err.message });
  }
}

export async function getRapidInstagramProfile(req, res) {
  try {
    const username = req.query.username;
    if (!username) {
      return res.status(400).json({ success: false, message: 'username wajib diisi' });
    }
    sendConsoleDebug({ tag: "INSTA", msg: `getRapidInstagramProfile ${username}` });
    const profile = await fetchInstagramProfile(username);
    if (profile && profile.username) {
      await instaProfileService.upsertProfile({
        username: profile.username,
        full_name: profile.full_name,
        biography: profile.biography,
        follower_count: profile.followers_count ?? profile.follower_count,
        following_count: profile.following_count,
        post_count: profile.media_count ?? profile.posts_count,
        profile_pic_url: profile.profile_pic_url,
      });
    }
    sendSuccess(res, profile);
  } catch (err) {
    sendConsoleDebug({ tag: "INSTA", msg: `Error getRapidInstagramProfile: ${err.message}` });
    const code = err.statusCode || err.response?.status || 500;
    res.status(code).json({ success: false, message: err.message });
  }
}

export async function getRapidInstagramInfo(req, res) {
  try {
    const username = req.query.username;
    if (!username) {
      return res.status(400).json({ success: false, message: 'username wajib diisi' });
    }
    sendConsoleDebug({ tag: "INSTA", msg: `getRapidInstagramInfo ${username}` });
    const info = await fetchInstagramInfo(username);
    sendSuccess(res, info);
  } catch (err) {
    sendConsoleDebug({ tag: "INSTA", msg: `Error getRapidInstagramInfo: ${err.message}` });
    const code = err.statusCode || err.response?.status || 500;
    res.status(code).json({ success: false, message: err.message });
  }
}

export async function getInstagramProfile(req, res) {
  try {
    const username = req.query.username;
    if (!username) {
      return res.status(400).json({ success: false, message: 'username wajib diisi' });
    }
    sendConsoleDebug({ tag: "INSTA", msg: `getInstagramProfile ${username}` });
    const profile = await instaProfileService.findByUsername(username);
    if (!profile) {
      return res.status(404).json({ success: false, message: 'profile not found' });
    }
    sendSuccess(res, profile);
  } catch (err) {
    sendConsoleDebug({ tag: "INSTA", msg: `Error getInstagramProfile: ${err.message}` });
    const code = err.statusCode || err.response?.status || 500;
    res.status(code).json({ success: false, message: err.message });
  }
}
