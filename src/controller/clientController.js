import * as clientService from '../service/clientService.js';
import * as userService from '../service/userService.js';
import * as instaPostService from '../service/instaPostService.js';
import * as instaLikeService from '../service/instaLikeService.js';
import * as tiktokPostService from '../service/tiktokPostService.js';
import * as tiktokCommentService from '../service/tiktokCommentService.js';
import { sendSuccess } from '../utils/response.js';
import * as clientModel from '../model/clientModel.js';

// List semua client (bisa filter by group)
export const getAllClients = async (req, res, next) => {
  try {
    const group = req.query.group;
    let clients;
    if (group) {
      clients = await clientService.findClientsByGroup(group);
    } else {
      clients = await clientService.findAllClients();
    }
    sendSuccess(res, clients);
  } catch (err) {
    next(err);
  }
};

// List semua client aktif
export const getActiveClients = async (req, res, next) => {
  try {
    const clients = await clientService.findAllActiveClients();
    sendSuccess(res, clients);
  } catch (err) {
    next(err);
  }
};

// Detail client
export const getClientById = async (req, res, next) => {
  try {
    const client = await clientService.findClientById(req.params.client_id);
    if (!client) return res.status(404).json({ error: 'Client not found' });
    sendSuccess(res, client);
  } catch (err) {
    next(err);
  }
};

// Update client
export const updateClient = async (req, res, next) => {
  try {
    const client = await clientService.updateClient(req.params.client_id, req.body);
    if (!client) return res.status(404).json({ error: 'Client not found' });
    sendSuccess(res, client);
  } catch (err) {
    next(err);
  }
};

// Delete client
export const deleteClient = async (req, res, next) => {
  try {
    const client = await clientService.deleteClient(req.params.client_id);
    if (!client) return res.status(404).json({ error: 'Client not found' });
    sendSuccess(res, client);
  } catch (err) {
    next(err);
  }
};

// Semua user di bawah client
export const getUsers = async (req, res, next) => {
  try {
    const users = await userService.findUsersByClientId(req.params.client_id);
    sendSuccess(res, users);
  } catch (err) {
    next(err);
  }
};

// Semua posting IG milik client
export const getInstagramPosts = async (req, res, next) => {
  try {
    const posts = await instaPostService.findByClientId(req.params.client_id);
    sendSuccess(res, posts);
  } catch (err) {
    next(err);
  }
};

// Semua like posting IG client (rekap)
export const getInstagramLikes = async (req, res, next) => {
  try {
    const posts = await instaPostService.findByClientId(req.params.client_id);
    let likesData = [];
    for (const post of posts) {
      const like = await instaLikeService.findByShortcode(post.shortcode);
      likesData.push({
        shortcode: post.shortcode,
        like_count: Array.isArray(like?.likes) ? like.likes.length : 0,
        likes: like?.likes || [],
      });
    }
    sendSuccess(res, likesData);
  } catch (err) {
    next(err);
  }
};

// Semua posting TikTok milik client
export const getTiktokPosts = async (req, res, next) => {
  try {
    const posts = await tiktokPostService.findByClientId(req.params.client_id);
    sendSuccess(res, posts);
  } catch (err) {
    next(err);
  }
};

// Semua komentar TikTok client (rekap)
export const getTiktokComments = async (req, res, next) => {
  try {
    const posts = await tiktokPostService.findByClientId(req.params.client_id);
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
};

// Ringkasan aktivitas client (dashboard)
export const getSummary = async (req, res, next) => {
  try {
    const client_id = req.params.client_id;
    const client = await clientService.findClientById(client_id);
    if (!client) return res.status(404).json({ error: 'Client not found' });

    const users = await userService.findUsersByClientId(client_id);
    const instaPosts = await instaPostService.findByClientId(client_id);
    let instaLikes = 0;
    for (const post of instaPosts) {
      const like = await instaLikeService.findByShortcode(post.shortcode);
      instaLikes += Array.isArray(like?.likes) ? like.likes.length : 0;
    }
    const tiktokPosts = await tiktokPostService.findByClientId(client_id);
    let tiktokComments = 0;
    for (const post of tiktokPosts) {
      const comm = await tiktokCommentService.findByVideoId(post.video_id);
      tiktokComments += Array.isArray(comm?.comments) ? comm.comments.length : 0;
    }

    sendSuccess(res, {
      client,
      user_count: users.length,
      insta_post_count: instaPosts.length,
      tiktok_post_count: tiktokPosts.length,
      total_insta_likes: instaLikes,
      total_tiktok_comments: tiktokComments,
    });
  } catch (err) {
    next(err);
  }
};


export async function getClientProfile(req, res, next) {
      console.log(req)

  try {
    const client_id = req.query.client_id || (req.user && req.user.client_id);

    if (!client_id) {
      return res.status(400).json({ message: "client_id required" });
    }
    const client = await clientModel.findById(client_id);
    if (!client) {
      return res.status(404).json({ message: "Client not found" });
    }
    res.json({ success: true, profile: client });
  } catch (err) {
    next(err);
  }
}



