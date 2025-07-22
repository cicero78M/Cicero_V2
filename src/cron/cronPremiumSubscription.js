import cron from 'node-cron';
import dotenv from 'dotenv';
dotenv.config();

import { query } from '../db/index.js';

cron.schedule(
  '0 0 * * *',
  async () => {
    await query(
      `UPDATE instagram_user
       SET premium_status=false
       WHERE premium_status=true AND premium_end_date <= NOW()`
    );
  },
  { timezone: 'Asia/Jakarta' }
);
