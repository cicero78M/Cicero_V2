import cron from 'node-cron';
import { expireOldRequests } from '../model/premiumRequestModel.js';

cron.schedule('*/30 * * * *', async () => {
  await expireOldRequests(3);
}, { timezone: 'Asia/Jakarta' });
