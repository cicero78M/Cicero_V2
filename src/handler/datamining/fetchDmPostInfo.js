import { fetchInstagramPostInfo } from '../../service/instagramApi.js';
import { sendDebug } from '../../middleware/debugHandler.js';
import {
  upsertIgUser,
  upsertIgPost,
  upsertIgMedia,
  insertHashtags,
  upsertTaggedUsers,
  getPostIdsTodayByUsername
} from '../../model/instaPostExtendedModel.js';
import { upsertPostMetrics } from '../../model/instaPostMetricsModel.js';

export async function fetchAndStoreDmPostInfo(postId) {
  try {
    const info = await fetchInstagramPostInfo(postId);
    if (!info) return;
    await upsertIgUser(info.user);
    await upsertIgPost(info, info.user?.id);
    if (info.metrics) {
      await upsertPostMetrics(info.id, info.metrics);
    }
    if (Array.isArray(info.hashtags)) {
      await insertHashtags(info.id, info.hashtags);
    }
    const medias = info.carousel_media || [info];
    for (const m of medias) {
      await upsertIgMedia(m, info.id);
      if (Array.isArray(m.tagged_users)) {
        await upsertTaggedUsers(m.id, m.tagged_users);
      }
    }
    sendDebug({ tag: 'IG DM POST INFO', msg: `Fetched info for ${postId}` });
  } catch (err) {
    sendDebug({ tag: 'IG DM POST INFO', msg: `[${postId}] ${err.message}` });
  }
}

export async function fetchDmPostInfoForUser(username) {
  const ids = await getPostIdsTodayByUsername(username);
  for (const id of ids) {
    await fetchAndStoreDmPostInfo(id);
  }
}
