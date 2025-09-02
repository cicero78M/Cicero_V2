import cron from 'node-cron';
import { clearAllBaileysSessions } from '../service/baileysSessionService.js';

cron.schedule(
  '0 2 * * *',
  () => {
    clearAllBaileysSessions().catch((err) => {
      console.error('[BAILEYS] cleanup failed:', err.message);
    });
  },
  { timezone: 'Asia/Jakarta' }
);

export default null;
