import cron from 'node-cron';
import { clearAllBaileysSessions, clearBaileysAuthFiles } from '../service/baileysSessionService.js';

cron.schedule(
  '0 3 * * *',
  () => {
    clearAllBaileysSessions().catch((err) => {
      console.error('[BAILEYS] cleanup failed:', err.message);
    });
  },
  { timezone: 'Asia/Jakarta' }
);

cron.schedule(
  '45 * * * *',
  () => {
    clearBaileysAuthFiles().catch((err) => {
      console.error('[BAILEYS] auth cleanup failed:', err.message);
    });
  },
  { timezone: 'Asia/Jakarta' }
);

export default null;
