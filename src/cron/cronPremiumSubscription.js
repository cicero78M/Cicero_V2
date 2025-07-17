import cron from 'node-cron';
import dotenv from 'dotenv';
dotenv.config();

import { query } from '../db/index.js';
import waClient from '../service/waService.js';
import { getAdminWAIds } from '../utils/waHelper.js';

cron.schedule(
  '0 0 * * *',
  async () => {
    await query(
      `UPDATE premium_subscription
       SET status='expired', end_date=NOW(), updated_at=NOW()
       WHERE status='active' AND start_date <= NOW() - INTERVAL '30 days'`
    );
  },
  { timezone: 'Asia/Jakarta' }
);

cron.schedule(
  '*/5 * * * *',
  async () => {
    await query(
      `UPDATE subscription_registration
       SET status='expired', reviewed_at=NOW()
       WHERE status='pending' AND created_at <= NOW() - INTERVAL '24 hours'`
    );
    const pending = await query(
      `SELECT registration_id, username, amount
       FROM subscription_registration
       WHERE status='pending'
       ORDER BY created_at`
    );
    if (pending.rows.length === 0) return;
    let msg = '*Reminder Pendaftaran Premium*\n';
    for (const r of pending.rows) {
      msg += `ID *${r.registration_id}* - ${r.username}`;
      if (r.amount) msg += ` (Rp${r.amount})`;
      msg += '\n';
    }
    msg +=
      'Balas GRANTSUB#ID untuk memberi akses atau DENYSUB#ID untuk menolak.';
    for (const admin of getAdminWAIds()) {
      waClient.sendMessage(admin, msg).catch(() => {});
    }
  },
  { timezone: 'Asia/Jakarta' }
);
