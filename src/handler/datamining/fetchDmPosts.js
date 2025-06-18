import { fetchInstagramPosts } from '../../service/instagramApi.js';
import { sendDebug } from '../../middleware/debugHandler.js';
import {
  upsertIgUser,
  upsertIgPost,
  upsertIgMedia,
  insertHashtags,
  upsertTaggedUsers
} from '../../model/instaPostExtendedModel.js';

export async function fetchDmPosts(username, limit = 50) {
  if (!username) return [];
  try {
    const posts = await fetchInstagramPosts(username, limit);
    for (const post of posts) {
      await upsertIgUser(post.user);
      await upsertIgPost(post, post.user?.id);
      if (Array.isArray(post.hashtags)) {
        await insertHashtags(post.id, post.hashtags);
      }
      const medias = post.carousel_media || [post];
      for (const m of medias) {
        await upsertIgMedia(m, post.id);
        if (Array.isArray(m.tagged_users)) {
          await upsertTaggedUsers(m.id, m.tagged_users);
        }
      }
    }
    sendDebug({ tag: 'IG DM POST', msg: `Fetched ${posts.length} posts for @${username}` });
    return posts.map(p => p.id);
  } catch (err) {
    sendDebug({ tag: 'IG DM POST ERROR', msg: err.message });
    return [];
  }
}
