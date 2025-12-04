import { env } from '../../config/env.js';
import { scheduleCronJob } from '../../utils/cronScheduler.js';
import { runCron as runFetchDirRequest, JOB_KEY as FETCH_SOSMED_JOB_KEY } from '../cronDirRequestFetchSosmed.js';
import { runCron as runRekapAllSocmed, JOB_KEY as REKAP_ALL_SOCMED_JOB_KEY } from '../cronDirRequestRekapAllSocmed.js';
import { runCron as runSosmedRank, JOB_KEY as SOSMED_RANK_JOB_KEY } from '../cronDirRequestSosmedRank.js';
import { runCron as runEngageRank, JOB_KEY as ENGAGE_RANK_JOB_KEY } from '../cronDirRequestEngageRank.js';
import {
  runDailyReport as runKasatkerDaily,
  runWeeklyReport as runKasatkerWeekly,
  runMonthlyReport as runKasatkerMonthly,
  JOB_KEY as KASATKER_JOB_KEY,
} from '../cronDirRequestLapharKasatker.js';
import { runCron as runDirektorat, JOB_KEY as DIREKTORAT_JOB_KEY } from '../cronDirRequestDirektorat.js';
import { runCron as runHighLow, JOB_KEY as HIGH_LOW_JOB_KEY } from '../cronDirRequestHighLow.js';
import {
  runDailyRecap as runKasatBinmasDaily,
  runWeeklyRecap as runKasatBinmasWeekly,
  runMonthlyRecap as runKasatBinmasMonthly,
  JOB_KEY as KASAT_BINMAS_JOB_KEY,
} from '../cronDirRequestKasatBinmasRecap.js';
import { runCron as runNotificationReminder, JOB_KEY as NOTIFICATION_REMINDER_JOB_KEY } from '../cronWaNotificationReminder.js';
import { runCron as runSatbinmasOfficialMedia, JOB_KEY as SATBINMAS_OFFICIAL_MEDIA_JOB_KEY } from '../cronDirRequestSatbinmasOfficialMedia.js';

const DEFAULT_CRON_OPTIONS = { timezone: 'Asia/Jakarta' };

const dirRequestCrons = [
  {
    jobKey: FETCH_SOSMED_JOB_KEY,
    description:
      'Fetch Ditbinmas Instagram/TikTok posts, refresh engagement metrics, and broadcast status deltas.',
    schedules: [
      { cronExpression: '30 6 * * *', handler: () => runFetchDirRequest(), options: DEFAULT_CRON_OPTIONS },
      { cronExpression: '0,30 7-20 * * *', handler: () => runFetchDirRequest(), options: DEFAULT_CRON_OPTIONS },
    ],
  },
  {
    jobKey: REKAP_ALL_SOCMED_JOB_KEY,
    description: 'Send Ditbinmas laphar narratives and recap attachments for daily runs.',
    schedules: [
      { cronExpression: '0 10 15,18 * * *', handler: () => runRekapAllSocmed(), options: DEFAULT_CRON_OPTIONS },
      { cronExpression: '0 37 20 * * *', handler: () => runRekapAllSocmed(), options: DEFAULT_CRON_OPTIONS },
    ],
  },
  {
    jobKey: SOSMED_RANK_JOB_KEY,
    description: 'Deliver Instagram like and TikTok comment rankings for Ditbinmas recipients.',
    schedules: [
      { cronExpression: '7 15 * * *', handler: () => runSosmedRank(), options: DEFAULT_CRON_OPTIONS },
      { cronExpression: '47 20 * * *', handler: () => runSosmedRank(), options: DEFAULT_CRON_OPTIONS },
    ],
  },
  {
    jobKey: ENGAGE_RANK_JOB_KEY,
    description: 'Generate engagement ranking narratives and Excel exports for Ditbinmas.',
    schedules: [
      { cronExpression: '7 15 * * *', handler: () => runEngageRank(), options: DEFAULT_CRON_OPTIONS },
      { cronExpression: '52 20 * * *', handler: () => runEngageRank(), options: DEFAULT_CRON_OPTIONS },
    ],
  },
  {
    jobKey: KASATKER_JOB_KEY,
    description: 'Send Ditbinmas kasatker daily, weekly, and monthly recaps.',
    schedules: [
      { cronExpression: '57 20 * * *', handler: () => runKasatkerDaily(), options: DEFAULT_CRON_OPTIONS },
      { cronExpression: '12 21 * * 0', handler: () => runKasatkerWeekly(), options: DEFAULT_CRON_OPTIONS },
      { cronExpression: '17 21 * * *', handler: () => runKasatkerMonthly(), options: DEFAULT_CRON_OPTIONS },
    ],
  },
  { 
    jobKey: DIREKTORAT_JOB_KEY,
    description: 'Dispatch Ditbinmas directorate attendance recaps.',
    schedules: [
      {
        cronExpression: '5 15 * * *',
        handler: () => runDirektorat({ clientIds: ['BIDHUMAS'], recipientMode: 'groupOnly' }),
        options: DEFAULT_CRON_OPTIONS,
      },
      {
        cronExpression: '5 18 * * *',
        handler: () => runDirektorat({ clientIds: ['BIDHUMAS'], recipientMode: 'groupOnly' }),
        options: DEFAULT_CRON_OPTIONS,
      },
      { cronExpression: '32 20 * * *', handler: () => runDirektorat(), options: DEFAULT_CRON_OPTIONS },
    ],
  },
  {
    jobKey: HIGH_LOW_JOB_KEY,
    description: 'Send weekly Instagram and TikTok high/low performance summaries.',
    schedules: [
      { cronExpression: '7 21 * * 0', handler: () => runHighLow(), options: DEFAULT_CRON_OPTIONS },
    ],
  },
  {
    jobKey: KASAT_BINMAS_JOB_KEY,
    description: 'Provide Ditbinmas Kasat Binmas recap messages.',
    schedules: [
      { cronExpression: '42 20 * * *', handler: () => runKasatBinmasDaily(), options: DEFAULT_CRON_OPTIONS },
      { cronExpression: '2 21 * * 0', handler: () => runKasatBinmasWeekly(), options: DEFAULT_CRON_OPTIONS },
      { cronExpression: '22 21 * * *', handler: () => runKasatBinmasMonthly(), options: DEFAULT_CRON_OPTIONS },
    ],
  },
  {
    jobKey: NOTIFICATION_REMINDER_JOB_KEY,
    description:
      'Send WhatsApp task reminders to Ditbinmas users who opted in, with nightly follow-ups for incomplete tasks.',
    schedules: [
      { cronExpression: '5 19 * * *', handler: () => runNotificationReminder(), options: DEFAULT_CRON_OPTIONS },
      { cronExpression: '45 19 * * *', handler: () => runNotificationReminder(), options: DEFAULT_CRON_OPTIONS },
      { cronExpression: '15 20 * * *', handler: () => runNotificationReminder(), options: DEFAULT_CRON_OPTIONS },
    ],
  },
  {
    jobKey: SATBINMAS_OFFICIAL_MEDIA_JOB_KEY,
    description: 'Share Satbinmas official media updates with Ditbinmas recipients.',
    schedules: [
      { cronExpression: '5 13,22 * * *', handler: () => runSatbinmasOfficialMedia(), options: DEFAULT_CRON_OPTIONS },
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
  const scheduledJobs = [];

  const activateGroup = () => {
    if (activated) {
      console.log('[CRON] dirRequest cron group already registered');
      return scheduledJobs;
    }

    activated = true;

    dirRequestCrons.forEach(({ jobKey, description, schedules }) => {
      schedules.forEach(({ cronExpression, handler, options }) => {
        console.log(`[CRON] Registering ${jobKey} (${description}) at ${cronExpression}`);
        scheduledJobs.push(scheduleCronJob(jobKey, cronExpression, handler, options));
      });
    });

    return scheduledJobs;
  };

  waGatewayClient.on('ready', () => {
    console.log('[CRON] WA gateway client ready event for dirRequest bucket');
    activateGroup();
  });

  waGatewayClient
    .waitForWaReady()
    .then(() => {
      console.log('[CRON] WA gateway client ready for dirRequest bucket');
      return activateGroup();
    })
    .catch(err => console.error('[CRON] Error waiting for WA gateway readiness', err));

  return scheduledJobs;
}
