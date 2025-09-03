import cron from 'node-cron';
import { clearBaileysAuthFiles } from '../service/baileysSessionService.js';
import { waClient } from '../service/waService.js';

// Periodically remove stale Baileys auth files.
// Skips cleanup while a Baileys socket is connected
// and only deletes files older than 24 hours.
const SAFE_AGE_MS = 24 * 60 * 60 * 1000;

cron.schedule(
  '15,45 * * * *',
  async () => {
    try {
      const state = await waClient.getState?.();
      if (state === 'open') {
        console.log('[BAILEYS] cleanup skipped - client connected');
        return;
      }
    } catch {
      /* ignore state check errors */
    }

    try {
      await clearBaileysAuthFiles(SAFE_AGE_MS);
    } catch (err) {
      console.error('[BAILEYS] auth cleanup failed:', err.message);
    }
  },
  { timezone: 'Asia/Jakarta' }
);

export default null;
