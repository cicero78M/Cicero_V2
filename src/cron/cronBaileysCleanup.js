import cron from 'node-cron';
import { clearAllBaileysSessions, clearBaileysAuthFiles } from '../service/baileysSessionService.js';

cron.schedule(
  '45 * * * *',
  () => {
    clearAllBaileysSessions().catch((err) => {
      console.error('[BAILEYS] cleanup failed:', err.message);
    });
  },
  { timezone: 'Asia/Jakarta' }
);


export default null;
