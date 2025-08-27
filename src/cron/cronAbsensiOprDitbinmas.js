import cron from 'node-cron';
import waClient from '../service/waService.js';
import { absensiRegistrasiDashboardDitbinmas } from '../handler/fetchabsensi/dashboard/absensiRegistrasiDashboardDitbinmas.js';
import { sendWAReport, getAdminWAIds } from '../utils/waHelper.js';

export async function runCron() {
  try {
    const msg = await absensiRegistrasiDashboardDitbinmas();
    await sendWAReport(waClient, msg, getAdminWAIds());
  } catch (err) {
    console.error('[CRON ABSENSI OPR DITBINMAS]', err.message);
  }
}

cron.schedule('57 7-20 * * *', runCron, { timezone: 'Asia/Jakarta' });

export default null;
