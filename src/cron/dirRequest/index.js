import { env } from '../../config/env.js';
import { scheduleCronJob } from '../../utils/cronScheduler.js';
import { runCron as runFetchDirRequest, JOB_KEY as FETCH_SOSMED_JOB_KEY } from '../cronDirRequestFetchSosmed.js';
import { runCron as runNotificationReminder, JOB_KEY as NOTIFICATION_REMINDER_JOB_KEY } from '../cronWaNotificationReminder.js';
import { runCron as runSatbinmasOfficialMedia, JOB_KEY as SATBINMAS_OFFICIAL_MEDIA_JOB_KEY } from '../cronDirRequestSatbinmasOfficialMedia.js';
import {
  runCron as runDirRequestCustomSequence,
  JOB_KEY as DIRREQUEST_CUSTOM_SEQUENCE_JOB_KEY,
  runDitbinmasRecapSequence,
  DITBINMAS_RECAP_JOB_KEY,
} from '../cronDirRequestCustomSequence.js';
import {
  runCron as runBidhumasEvening,
  JOB_KEY as BIDHUMAS_EVENING_JOB_KEY,
} from '../cronDirRequestBidhumasEvening.js';

const DEFAULT_CRON_OPTIONS = { timezone: 'Asia/Jakarta' };
const READINESS_GRACE_MS = 60000;

const dirRequestCrons = [
  {
    jobKey: FETCH_SOSMED_JOB_KEY,
    description:
      'Fetch Ditbinmas Instagram/TikTok posts, refresh engagement metrics, and broadcast status deltas.',
    schedules: [
      { cronExpression: '30 6 * * *', handler: () => runFetchDirRequest(), options: DEFAULT_CRON_OPTIONS },
      { cronExpression: '0,30 7-14 * * *', handler: () => runFetchDirRequest(), options: DEFAULT_CRON_OPTIONS },
      { cronExpression: '30 15 * * *', handler: () => runFetchDirRequest(), options: DEFAULT_CRON_OPTIONS },
      { cronExpression: '0,30 16-17 * * *', handler: () => runFetchDirRequest(), options: DEFAULT_CRON_OPTIONS },
      { cronExpression: '30 18 * * *', handler: () => runFetchDirRequest(), options: DEFAULT_CRON_OPTIONS },
      { cronExpression: '0,30 19-21 * * *', handler: () => runFetchDirRequest(), options: DEFAULT_CRON_OPTIONS },
    ],
  },
  {
    jobKey: NOTIFICATION_REMINDER_JOB_KEY,
    description:
      'Send WhatsApp task reminders to Ditbinmas users who opted in, with nightly follow-ups for incomplete tasks.',
    schedules: [
      { cronExpression: '20 18 * * *', handler: () => runNotificationReminder(), options: DEFAULT_CRON_OPTIONS },
      { cronExpression: '50 18 * * *', handler: () => runNotificationReminder(), options: DEFAULT_CRON_OPTIONS },
      { cronExpression: '20 19 * * *', handler: () => runNotificationReminder(), options: DEFAULT_CRON_OPTIONS },
      { cronExpression: '50 19 * * *', handler: () => runNotificationReminder(), options: DEFAULT_CRON_OPTIONS },
      { cronExpression: '20 20 * * *', handler: () => runNotificationReminder(), options: DEFAULT_CRON_OPTIONS },
    ],
  },
  {
    jobKey: SATBINMAS_OFFICIAL_MEDIA_JOB_KEY,
    description: 'Share Satbinmas official media updates with Ditbinmas recipients.',
    schedules: [
      { cronExpression: '5 23 * * *', handler: () => runSatbinmasOfficialMedia(), options: DEFAULT_CRON_OPTIONS },
    ],
  },
  {
    jobKey: DIRREQUEST_CUSTOM_SEQUENCE_JOB_KEY,
    description:
      'Run dirRequest custom sequence: sosmed fetch then Ditbinmas menus 6/9/30/34/35 for super admins and operators.',
    schedules: [
      { cronExpression: '0 15 * * *', handler: () => runDirRequestCustomSequence(), options: DEFAULT_CRON_OPTIONS },
      { cronExpression: '0 18 * * *', handler: () => runDirRequestCustomSequence(), options: DEFAULT_CRON_OPTIONS },
      { cronExpression: '30 20 * * *', handler: () => runDirRequestCustomSequence(), options: DEFAULT_CRON_OPTIONS },
    ],
  },
  {
    jobKey: DITBINMAS_RECAP_JOB_KEY,
    description:
      'Send Ditbinmas evening recap: menus 6, 9, 34, 35 to super admins and menu 30 to operators with weekly/monthly add-ons.',
    schedules: [
      { cronExpression: '30 20 * * *', handler: () => runDitbinmasRecapSequence(), options: DEFAULT_CRON_OPTIONS },
    ],
  },

    {
    jobKey: BIDHUMAS_EVENING_JOB_KEY,
    description:
      'Send Bidhumas 22.00 evening recap..',
    schedules: [
      { cronExpression: '00 22 * * *', handler: () => runBidhumasEvening(), options: DEFAULT_CRON_OPTIONS },
    ],
  },
];

export function registerDirRequestCrons(waGatewayClient) {
  if (!waGatewayClient) {
    throw new Error('waGatewayClient is required to register dirRequest crons');
  }

  if (process.env.JEST_WORKER_ID !== undefined) {
    console.log('[CRON] Skipping dirRequest cron registration during tests');
    return [];
  }

  if (!env.ENABLE_DIRREQUEST_GROUP) {
    console.log('[CRON] dirRequest cron group disabled via ENABLE_DIRREQUEST_GROUP flag');
    return [];
  }

  let activated = false;
  let readinessFallbackTimer;
  const scheduledJobs = [];

  const activateGroup = () => {
    if (activated) {
      console.log('[CRON] dirRequest cron group already registered');
      return scheduledJobs;
    }

    activated = true;
    clearTimeout(readinessFallbackTimer);

    dirRequestCrons.forEach(({ jobKey, description, schedules }) => {
      schedules.forEach(({ cronExpression, handler, options }) => {
        console.log(`[CRON] Registering ${jobKey} (${description}) at ${cronExpression}`);
        scheduledJobs.push(scheduleCronJob(jobKey, cronExpression, handler, options));
      });
    });

    return scheduledJobs;
  };

  const deferWithGracePeriod = reason => {
    if (readinessFallbackTimer || activated) return;
    console.log(
      `[CRON] dirRequest cron registration deferred (${reason}); will auto-activate after ${READINESS_GRACE_MS}ms grace period`,
    );
    readinessFallbackTimer = setTimeout(() => {
      if (activated) return;
      console.warn(
        '[CRON] Activating dirRequest cron group after WA readiness grace period elapsed; WA ready event/promise missing',
      );
      activateGroup();
    }, READINESS_GRACE_MS);
  };

  waGatewayClient.on('ready', () => {
    console.log('[CRON] WA gateway client ready event for dirRequest bucket');
    activateGroup();
  });

  deferWithGracePeriod('waiting for WA gateway readiness');

  waGatewayClient
    .waitForWaReady()
    .then(() => {
      console.log('[CRON] WA gateway client ready for dirRequest bucket');
      return activateGroup();
    })
    .catch(err => {
      console.error('[CRON] Error waiting for WA gateway readiness, will rely on grace-period activation', err);
      deferWithGracePeriod('waGatewayClient.waitForWaReady rejected');
    });

  return scheduledJobs;
}
