import { fetchInstagramPostInfo } from '../../service/instagramApi.js';
import { getShortcodesTodayByClient } from '../../model/instaPostModel.js';
import {
  upsertIgUser,
  upsertIgPost,
  upsertIgMedia,
  insertHashtags,
  upsertTaggedUsers
} from '../../model/instaPostExtendedModel.js';
import { upsertPostMetrics } from '../../model/instaPostMetricsModel.js';
import { sendDebug } from '../../middleware/debugHandler.js';

export async function fetchAndStorePostInfo(shortcode) {
  try {
    const info = await fetchInstagramPostInfo(shortcode);
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
    sendDebug({ tag: 'IG POST INFO', msg: `Fetched info for ${shortcode}` });
  } catch (err) {
    sendDebug({ tag: 'IG POST INFO', msg: `[${shortcode}] ${err.message}` });
  }
}

export async function fetchPostInfoForClient(clientId) {
  const shortcodes = await getShortcodesTodayByClient(clientId);
  for (const sc of shortcodes) {
    await fetchAndStorePostInfo(sc);
  }
}
