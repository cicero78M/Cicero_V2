import { searchInstagramUsers, fetchInstagramPosts } from './instaRapidService.js';
import { upsertPolresAccount } from '../model/polresAccountModel.js';

export async function searchAndRegisterPolres(query) {
  const results = await searchInstagramUsers(query, 20);
  const valid = [];
  const now = Date.now();

  for (const user of results) {
    const username = user.username || user.pk || user.id;
    if (!username) continue;
    try {
      const posts = await fetchInstagramPosts(username, 1);
      const latest = posts[0];
      if (!latest) continue;
      const ts = latest.taken_at ? latest.taken_at * 1000 : latest.created_at;
      if (ts && now - ts <= 3 * 24 * 60 * 60 * 1000) {
        await upsertPolresAccount({ username, last_post_at: new Date(ts).toISOString() });
        valid.push(username);
      }
    } catch {
      continue;
    }
  }
  return valid;
}
