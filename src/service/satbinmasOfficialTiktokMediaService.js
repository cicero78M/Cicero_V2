import * as clientModel from '../model/clientModel.js';
import * as satbinmasOfficialAccountModel from '../model/satbinmasOfficialAccountModel.js';
import { fetchTiktokPosts, fetchTiktokPostsBySecUid } from './tiktokRapidService.js';
import { upsertTiktokPostWithStatus } from '../model/tiktokPostModel.js';

const RAPIDAPI_FETCH_DELAY_MS = 1500;

const wait = (ms = RAPIDAPI_FETCH_DELAY_MS) =>
  new Promise((resolve) => setTimeout(resolve, ms > 0 ? ms : 0));

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

function resolveCreatedAt(post) {
  const candidates = [
    post?.createTime,
    post?.create_time,
    post?.createTimeISO,
    post?.createTimeMillis,
    post?.create_time_unix,
    post?.create_time_ms,
  ];
  for (const value of candidates) {
    const parsed = normalizeTimestamp(value);
    if (parsed) return parsed;
  }
  return null;
}

function parseCaption(post) {
  if (typeof post?.desc === 'string') return post.desc.trim();
  if (typeof post?.caption === 'string') return post.caption.trim();
  if (post?.title?.text) return String(post.title.text).trim();
  return '';
}

function toInteger(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Math.trunc(numeric);
}

function summarizeEngagement(posts = []) {
  return posts.reduce(
    (acc, post) => {
      const likeCount = toInteger(post?.digg_count ?? post?.stats?.diggCount);
      const commentCount = toInteger(post?.comment_count ?? post?.stats?.commentCount);
      if (likeCount != null) acc.likes += likeCount;
      if (commentCount != null) acc.comments += commentCount;
      return acc;
    },
    { likes: 0, comments: 0 }
  );
}

async function fetchPostsForAccount(account, limit = 50, delayMs = RAPIDAPI_FETCH_DELAY_MS) {
  const fetchers = [];

  if (account?.secUid) {
    fetchers.push(() => fetchTiktokPostsBySecUid(account.secUid, limit));
  }
  fetchers.push(() => fetchTiktokPosts(account.username, limit));

  let lastError = null;
  for (let index = 0; index < fetchers.length; index += 1) {
    try {
      return await fetchers[index]();
    } catch (error) {
      lastError = error;
      const status = error?.statusCode || error?.response?.status;
      const isRateLimited = status === 429;
      const isRetryAvailable = index < fetchers.length - 1;
      if (isRateLimited || isRetryAvailable) {
        await wait(delayMs);
      }
    }
  }

  if (lastError) throw lastError;
  return [];
}

function getTodayRange() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

async function fetchMediaForClient(client, delayMs = RAPIDAPI_FETCH_DELAY_MS) {
  const accounts = await satbinmasOfficialAccountModel.findActiveByClientAndPlatform(
    client.client_id,
    'tiktok'
  );

  const { start, end } = getTodayRange();
  const summary = {
    clientId: client.client_id,
    name: client.nama || null,
    accounts: [],
    errors: [],
  };

  if (!accounts.length) return summary;

  for (let index = 0; index < accounts.length; index += 1) {
    const account = accounts[index];
    try {
      const posts = await fetchPostsForAccount(account, 50, delayMs);
      const todaysPosts = (posts || []).filter((post) => {
        const createdAt = resolveCreatedAt(post);
        return createdAt && createdAt >= start && createdAt < end;
      });

      let inserted = 0;
      let updated = 0;
      let failed = 0;
      const engagement = summarizeEngagement(todaysPosts);

      for (const post of todaysPosts) {
        const createdAt = resolveCreatedAt(post) || start;
        const videoId = post?.id || post?.video_id;
        if (!videoId) {
          failed += 1;
          continue;
        }

        const result = await upsertTiktokPostWithStatus({
          client_id: client.client_id,
          video_id: videoId,
          caption: parseCaption(post),
          like_count: post?.digg_count ?? post?.stats?.diggCount,
          comment_count: post?.comment_count ?? post?.stats?.commentCount,
          created_at: createdAt,
        });

        if (result.inserted) inserted += 1;
        else if (result.updated) updated += 1;
      }

      summary.accounts.push({
        username: account.username,
        total: todaysPosts.length,
        inserted,
        updated,
        failed,
        removed: 0,
        likes: engagement.likes,
        comments: engagement.comments,
      });
    } catch (error) {
      summary.errors.push({
        username: account.username,
        message: error?.message?.slice(0, 200) || 'Gagal mengambil konten TikTok.',
      });
    }

    const isLastAccount = index === accounts.length - 1;
    if (!isLastAccount) await wait(delayMs);
  }

  return summary;
}

export async function fetchTodaySatbinmasOfficialTiktokMedia(clientId, delayMs = RAPIDAPI_FETCH_DELAY_MS) {
  const client = await clientModel.findById(clientId);
  if (!client) throw new Error('Client not found');
  return fetchMediaForClient(client, delayMs);
}

export async function fetchTodaySatbinmasOfficialTiktokMediaForOrgClients(
  delayMs = RAPIDAPI_FETCH_DELAY_MS
) {
  const clients = await clientModel.findAllOrgClients();
  const summaries = [];
  const totals = { clients: clients.length, accounts: 0, fetched: 0, inserted: 0, updated: 0, failed: 0 };

  for (let index = 0; index < clients.length; index += 1) {
    const client = clients[index];
    const summary = await fetchMediaForClient(client, delayMs);

    summaries.push(summary);
    totals.accounts += summary.accounts.length;
    summary.accounts.forEach((account) => {
      totals.fetched += account.total;
      totals.inserted += account.inserted;
      totals.updated += account.updated;
      totals.failed += account.failed;
    });
    totals.failed += summary.errors.length;

    const isLastClient = index === clients.length - 1;
    if (!isLastClient) await wait(delayMs);
  }

  return { clients: summaries, totals };
}
