import './src/utils/logger.js';
import { env } from './src/config/env.js';

const cronJobs = {
  cronInstaService: () => import('./src/cron/cronInstaService.js'),
  cronTiktokService: () => import('./src/cron/cronTiktokService.js'),
  cronInstaLaphar: () => import('./src/cron/cronInstaLaphar.js'),
  cronTiktokLaphar: () => import('./src/cron/cronTiktokLaphar.js'),
  cronNotifikasiLikesDanKomentar: () => import('./src/cron/cronNotifikasiLikesDanKomentar.js'),
  cronInstaDataMining: () => import('./src/cron/cronInstaDataMining.js'),
  cronPremiumSubscription: () => import('./src/cron/cronPremiumSubscription.js'),
  cronRekapLink: () => import('./src/cron/cronRekapLink.js'),
  cronAmplifyLinkMonthly: () => import('./src/cron/cronAmplifyLinkMonthly.js'),
  cronPremiumRequest: () => import('./src/cron/cronPremiumRequest.js'),
  cronAbsensiUserData: () => import('./src/cron/cronAbsensiUserData.js'),
  cronAbsensiOprDitbinmas: () => import('./src/cron/cronAbsensiOprDitbinmas.js'),
  cronDirRequest: () => import('./src/cron/cronDirRequest.js'),
  cronDbBackup: () => import('./src/cron/cronDbBackup.js')
};

const selectedJobs = env.CRON_JOBS
  ? env.CRON_JOBS.split(',').map((j) => j.trim()).filter(Boolean)
  : Object.keys(cronJobs);

for (const job of selectedJobs) {
  const loader = cronJobs[job];
  if (loader) {
    await loader();
  }
}
