import cron from 'node-cron';
import dotenv from 'dotenv';
dotenv.config();

import { fetchAndStoreInstaContent } from '../handler/fetchpost/instaFetchPost.js';
import { fetchPostInfoForClient } from '../handler/fetchpost/instaFetchPostInfo.js';
import { handleFetchLikesInstagram } from '../handler/fetchengagement/fetchLikesInstagram.js';
import { handleFetchKomentarInstagram } from '../handler/fetchengagement/fetchCommentInstagram.js';
import { fetchInstagramHashtag } from '../service/instagramApi.js';
import { upsertHashtagInfo } from '../model/instaHashtagModel.js';
import { query } from '../db/index.js';
import { sendDebug } from '../middleware/debugHandler.js';

async function getActiveClientsIG() {
  const res = await query(
    `SELECT client_id, client_insta FROM clients WHERE client_status = true AND client_insta_status = true`
  );
  return res.rows;
}

function extractTopHashtags(captions) {
  const count = {};
  for (const text of captions) {
    const matches = text ? text.match(/#[A-Za-z0-9_]+/g) : null;
    if (!matches) continue;
    for (const m of matches) {
      const tag = m.replace('#', '').toLowerCase();
      count[tag] = (count[tag] || 0) + 1;
    }
  }
  return Object.entries(count)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([t]) => t);
}

async function fetchTopHashtagsForClient(client_id) {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  const { rows } = await query(
    `SELECT caption FROM insta_post WHERE client_id = $1 AND DATE(created_at) = $2`,
    [client_id, `${yyyy}-${mm}-${dd}`]
  );
  const captions = rows.map(r => r.caption || '');
  const topTags = extractTopHashtags(captions);
  for (const tag of topTags) {
    try {
      const { info } = await fetchInstagramHashtag(tag);
      if (info) await upsertHashtagInfo({ id: info.id, name: info.name, ...info });
      sendDebug({ tag: 'IG DM', msg: `Hashtag ${tag} disimpan`, client_id });
    } catch (err) {
      sendDebug({ tag: 'IG DM', msg: `Gagal hashtag ${tag}: ${(err && err.message) || String(err)}`, client_id });
    }
  }
}

cron.schedule(
  '0 22 * * *',
  async () => {
    sendDebug({ tag: 'IG DM', msg: 'Mulai cron data mining Instagram' });
    try {
      const clients = await getActiveClientsIG();
      const keys = ['code', 'caption', 'like_count', 'taken_at', 'comment_count'];
      await fetchAndStoreInstaContent(keys);
      for (const client of clients) {
        await fetchPostInfoForClient(client.client_id);
        await fetchTopHashtagsForClient(client.client_id);
        await handleFetchLikesInstagram(null, null, client.client_id);
        await handleFetchKomentarInstagram(null, null, client.client_id);
      }
      sendDebug({ tag: 'IG DM', msg: 'Cron data mining IG selesai' });
    } catch (err) {
      sendDebug({ tag: 'IG DM', msg: (err && err.message) || String(err) });
    }
  },
  { timezone: 'Asia/Jakarta' }
);

export default null;
