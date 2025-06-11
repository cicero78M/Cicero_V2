import * as tiktokPostService from '../service/tiktokPostService.js';
import * as tiktokCommentService from '../service/tiktokCommentService.js';
import { sendSuccess } from '../utils/response.js';

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
