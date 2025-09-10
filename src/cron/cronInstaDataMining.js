import cron from 'node-cron';
import dotenv from 'dotenv';
dotenv.config();

import { fetchDmPosts } from '../handler/datamining/fetchDmPosts.js';
import { fetchDmPostInfoForUser } from '../handler/datamining/fetchDmPostInfo.js';
import { handleFetchLikesInstagramDM } from '../handler/datamining/fetchDmLikes.js';
import { handleFetchKomentarInstagramDM } from '../handler/datamining/fetchDmComments.js';
import { fetchDmHashtagsForUser } from '../handler/datamining/fetchDmHashtags.js';
import { query } from '../db/index.js';
import { sendDebug } from '../middleware/debugHandler.js';

async function getActiveClientsIG() {
  const res = await query(
    `SELECT client_id, client_insta, client_insta_status
     FROM clients
     WHERE client_status = true
       AND client_insta_status = true
       AND client_type = 'ORG'`
  );
  return res.rows;
}


cron.schedule(
  '30 23 * * *',
  async () => {
    sendDebug({ tag: 'IG DM', msg: 'Mulai cron data mining Instagram' });
    try {
      const clients = await getActiveClientsIG();
      for (const client of clients) {
        const username = client.client_insta;
        await fetchDmPosts(username);
        await fetchDmPostInfoForUser(username);
        await fetchDmHashtagsForUser(username);
        await handleFetchLikesInstagramDM(username);
        await handleFetchKomentarInstagramDM(username);
      }
      sendDebug({ tag: 'IG DM', msg: 'Cron data mining IG selesai' });
    } catch (err) {
      sendDebug({ tag: 'IG DM', msg: (err && err.message) || String(err) });
    }
  },
  { timezone: 'Asia/Jakarta' }
);

export default null;
