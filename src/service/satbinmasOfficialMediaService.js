import * as clientModel from '../model/clientModel.js';
import * as satbinmasOfficialAccountModel from '../model/satbinmasOfficialAccountModel.js';
import * as satbinmasOfficialMediaModel from '../model/satbinmasOfficialMediaModel.js';
import { fetchInstagramPosts } from './instaRapidService.js';

function createError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function normalizeTimestamp(value) {
  if (!value && value !== 0) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'number') {
    const ms = value > 1e12 ? value : value * 1000;
    const parsed = new Date(ms);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (typeof value === 'string') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

function resolveTakenAt(post) {
  const candidates = [
    post?.taken_at,
    post?.taken_at_timestamp,
    post?.taken_at_ms,
    post?.created_at,
    post?.created_time,
    post?.device_timestamp,
    post?.timestamp,
  ];
  for (const candidate of candidates) {
    const date = normalizeTimestamp(candidate);
    if (date) return date;
  }
  return null;
}

function toInteger(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Math.trunc(numeric);
}

function parseCaptionText(post) {
  const caption = post?.caption;
  if (caption && typeof caption === 'object' && typeof caption.text === 'string') {
    return caption.text.trim();
  }
  if (typeof post?.caption_text === 'string') return post.caption_text.trim();
  if (typeof post?.captionText === 'string') return post.captionText.trim();
  if (typeof caption === 'string') return caption.trim();
  return null;
}

function extractHashtags(captionText) {
  if (!captionText) return [];
  const matches = captionText.match(/#([\p{L}\p{N}._-]+)/gu) || [];
  return matches.map((tag) => tag.replace(/^#/, '')).filter(Boolean);
}

function extractMentions(captionText) {
  if (!captionText) return [];
  const matches = captionText.match(/@([A-Za-z0-9._]+)/gu) || [];
  return matches.map((mention) => mention.replace(/^@/, '')).filter(Boolean);
}

function extractMediaUrls(post) {
  const primaryImage =
    post?.thumbnail_url ||
    post?.thumbnail_src ||
    post?.display_url ||
    post?.image_versions2?.candidates?.[0]?.url ||
    (Array.isArray(post?.carousel_media)
      ? post.carousel_media[0]?.image_versions2?.candidates?.[0]?.url
      : null);
  const mediaUrl =
    primaryImage ||
    (Array.isArray(post?.carousel_media)
      ? post.carousel_media[0]?.carousel_media?.[0]?.image_versions2?.candidates?.[0]?.url
      : null);
  const videoUrl =
    post?.video_url ||
    post?.video_versions?.[0]?.url ||
    (Array.isArray(post?.carousel_media)
      ? post.carousel_media[0]?.video_versions?.[0]?.url
      : null);
  return {
    thumbnail_url: primaryImage || null,
    media_url: mediaUrl || primaryImage || null,
    video_url: videoUrl || null,
  };
}

function extractDimensions(post) {
  const width = post?.original_width || post?.dimensions?.width || post?.width;
  const height = post?.original_height || post?.dimensions?.height || post?.height;
  const duration = post?.video_duration || post?.duration || post?.duration_seconds;
  const durationNumber = Number(duration);
  return {
    width: toInteger(width),
    height: toInteger(height),
    duration_seconds: Number.isFinite(durationNumber) ? durationNumber : null,
  };
}

function normalizeInstagramMedia(account, post, takenAt, fetchDate) {
  if (!account?.satbinmas_account_id) {
    throw createError('satbinmas_account_id is required', 400);
  }
  if (!takenAt) return null;

  const igCreatedAt = normalizeTimestamp(post?.created_at) || normalizeTimestamp(post?.created_time);
  const captionText = parseCaptionText(post);
  const { thumbnail_url, media_url, video_url } = extractMediaUrls(post);
  const { width, height, duration_seconds } = extractDimensions(post);
  const hashtags = extractHashtags(captionText);
  const mentions = extractMentions(captionText);
  const mediaId = post?.media_id || post?.id || (post?.pk ? String(post.pk) : null);

  if (!mediaId) return null;

  return {
    satbinmas_account_id: account.satbinmas_account_id,
    client_id: account.client_id,
    username: account.username,
    media_id: mediaId,
    code: post?.code || post?.shortcode || null,
    media_type: post?.media_type || null,
    product_type: post?.product_type || null,
    taken_at: takenAt,
    ig_created_at: igCreatedAt,
    caption_text: captionText,
    like_count: toInteger(post?.like_count ?? post?.likeCount ?? post?.likes),
    comment_count: toInteger(post?.comment_count ?? post?.commentCount),
    view_count: toInteger(post?.view_count ?? post?.viewCount),
    play_count: toInteger(post?.play_count ?? post?.playCount),
    save_count: toInteger(post?.save_count ?? post?.saveCount),
    share_count: toInteger(post?.share_count ?? post?.shareCount),
    thumbnail_url,
    media_url,
    video_url,
    width,
    height,
    duration_seconds,
    fetched_for_date: fetchDate,
    is_album: Array.isArray(post?.carousel_media) || post?.media_type === 'CAROUSEL_ALBUM',
    is_video: Boolean(video_url || post?.media_type === 'VIDEO' || post?.product_type === 'igtv'),
    hashtags,
    mentions,
  };
}

function getTodayRange() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

export async function fetchTodaySatbinmasOfficialMedia(clientId, usernameFilter = null) {
  const client = await clientModel.findById(clientId);
  if (!client) {
    throw createError('Client not found', 404);
  }

  const accounts = await satbinmasOfficialAccountModel.findActiveByClientAndPlatform(
    client.client_id,
    'instagram'
  );

  const normalizedUsername = usernameFilter?.trim().toLowerCase() || null;
  const scopedAccounts = normalizedUsername
    ? accounts.filter((acc) => acc.username?.toLowerCase() === normalizedUsername)
    : accounts;

  const { start, end } = getTodayRange();
  const summary = {
    clientId: client.client_id,
    accounts: [],
    totals: { fetched: 0, inserted: 0, updated: 0 },
    errors: [],
  };

  if (!scopedAccounts.length) {
    return summary;
  }

  for (const account of scopedAccounts) {
    try {
      const posts = await fetchInstagramPosts(account.username, 50);
      const postsWithDate = posts
        .map((post) => ({ post, takenAt: resolveTakenAt(post) }))
        .filter((item) => item.takenAt && item.takenAt >= start && item.takenAt < end);

      let inserted = 0;
      let updated = 0;

      for (const item of postsWithDate) {
        const normalized = normalizeInstagramMedia(account, item.post, item.takenAt, start);
        if (!normalized) continue;

        const { media, inserted: isInserted } = await satbinmasOfficialMediaModel.upsertMedia(normalized);

        if (media?.satbinmas_media_id) {
          await satbinmasOfficialMediaModel.replaceHashtagsForMedia(
            media.satbinmas_media_id,
            normalized.hashtags
          );
          await satbinmasOfficialMediaModel.replaceMentionsForMedia(
            media.satbinmas_media_id,
            normalized.mentions
          );
        }

        if (isInserted) {
          inserted += 1;
        } else {
          updated += 1;
        }
      }

      summary.accounts.push({
        username: account.username,
        total: postsWithDate.length,
        inserted,
        updated,
      });
      summary.totals.fetched += postsWithDate.length;
      summary.totals.inserted += inserted;
      summary.totals.updated += updated;
    } catch (error) {
      summary.errors.push({
        username: account.username,
        message: error?.message || 'Unknown error',
      });
    }
  }

  return summary;
}
