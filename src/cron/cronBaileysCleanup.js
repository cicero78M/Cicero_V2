import cron from 'node-cron';
import { clearBaileysAuthFiles } from '../service/baileysSessionService.js';

cron.schedule(
  '15,45 * * * *',
  () => {
    clearBaileysAuthFiles().catch((err) => {
      console.error('[BAILEYS] auth cleanup failed:', err.message);
    });
  },
  { timezone: 'Asia/Jakarta' }
);

export default null;
