import { scheduleCronJob } from '../utils/cronScheduler.js';
import { expirePendingRequests } from '../service/dashboardPremiumRequestExpiryService.js';

export const JOB_KEY = './src/cron/cronDashboardPremiumRequestExpiry.js';
const CRON_EXPRESSION = '*/10 * * * *';
const CRON_OPTIONS = { timezone: 'Asia/Jakarta' };

export async function runCron() {
  const { checked, expired, notified } = await expirePendingRequests({});
  console.log(
    `[CRON] Dashboard premium request expiry completed. Checked: ${checked}, expired: ${expired}, notified: ${notified}`,
  );
}

scheduleCronJob(JOB_KEY, CRON_EXPRESSION, runCron, CRON_OPTIONS);

export default null;
