import cron from 'node-cron';
import * as clientModel from '../model/clientModel.js';
import { savePosts, fetchInstagramPosts } from '../service/instagramServices.js';
import { sendWa } from '../service/waService.js';
import dotenv from 'dotenv';
dotenv.config();

async function fetchAndSaveInstagram() {
  try {
    const clients = await clientModel.findAll();
    const activeClients = clients.filter(c => c.client_status && c.insta_status);
    if (activeClients.length === 0) return;

    for (const client of activeClients) {
      let posts = [];
      let message = '';
      try {
        posts = await fetchInstagramPosts(client.insta_username);
        await savePosts(client.client_id, posts);

        if (posts.length > 0) {
          // Format link IG: https://www.instagram.com/p/{code}/
          const links = posts.map(p => `https://www.instagram.com/p/${p.code}/`).join('\n');
          message = `[IG Success] ${client.insta_username}\nJumlah post: ${posts.length}\n${links}`;
        } else {
          message = `[IG Success] ${client.insta_username}\nTidak ada postingan baru hari ini.`;
        }
      } catch (err) {
        message = `[IG ERROR] ${client.insta_username}\n${err.message}`;
      }

      // Kirim ke WhatsApp admin
      await sendWa(process.env.ADMIN_WHATSAPP, message);
    }
  } catch (err) {
    await sendWa(process.env.ADMIN_WHATSAPP, `[IG CRON ERROR]\n${err.message}`);
    console.error('Instagram cronjob error:', err);
  }
}

// Setiap jam 6-20 (1 jam sekali)
cron.schedule('0 6-22 * * *', fetchAndSaveInstagram);

export default fetchAndSaveInstagram;
