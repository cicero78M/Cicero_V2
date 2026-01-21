import { env } from '../../config/env.js';
import { scheduleCronJob } from '../../utils/cronScheduler.js';
import { runCron as runFetchDirRequest, JOB_KEY as FETCH_SOSMED_JOB_KEY } from '../cronDirRequestFetchSosmed.js';
import { runCron as runNotificationReminder, JOB_KEY as NOTIFICATION_REMINDER_JOB_KEY } from '../cronWaNotificationReminder.js';
import { runCron as runSatbinmasOfficialMedia, JOB_KEY as SATBINMAS_OFFICIAL_MEDIA_JOB_KEY } from '../cronDirRequestSatbinmasOfficialMedia.js';
import {
  runCron as runDirRequestCustomSequence,
  JOB_KEY as DIRREQUEST_CUSTOM_SEQUENCE_JOB_KEY,
  runDitbinmasRecapAndCustomSequence,
  DITBINMAS_RECAP_AND_CUSTOM_JOB_KEY,
} from '../cronDirRequestCustomSequence.js';
import {
  runCron as runBidhumasEvening,
  JOB_KEY as BIDHUMAS_EVENING_JOB_KEY,
} from '../cronDirRequestBidhumasEvening.js';

const DEFAULT_CRON_OPTIONS = { timezone: 'Asia/Jakarta' };
const DIRREQUEST_WA_READY_TIMEOUT_MS = (() => {
  const resolvedTimeout = Number(
    process.env.DIRREQUEST_WA_READY_TIMEOUT_MS
      || process.env.WA_GATEWAY_READY_TIMEOUT_MS
      || process.env.WA_READY_TIMEOUT_MS
      || 5 * 60 * 1000,
  );
  return Number.isNaN(resolvedTimeout) ? 5 * 60 * 1000 : resolvedTimeout;
})();

const waitForWaGatewayReadyWithTimeout = (waGatewayClient, timeoutMs) => {
  if (typeof waGatewayClient?.waitForWaReady !== 'function') {
    return Promise.resolve();
  }

  if (!timeoutMs || Number.isNaN(Number(timeoutMs))) {
    return waGatewayClient.waitForWaReady();
  }

  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`[CRON] WA gateway not ready after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  return Promise.race([waGatewayClient.waitForWaReady(), timeoutPromise]).finally(() => {
    if (timeoutId) clearTimeout(timeoutId);
  });
};

const createDirRequestCustomSequenceHandler = waGatewayClient => {
  return async () => {
    try {
      await waitForWaGatewayReadyWithTimeout(waGatewayClient, DIRREQUEST_WA_READY_TIMEOUT_MS);
    } catch (error) {
      console.warn(
        `[CRON] DirRequest custom sequence skipped: WA gateway readiness timeout after ${DIRREQUEST_WA_READY_TIMEOUT_MS}ms`,
        error,
      );
      return;
    }

    return runDirRequestCustomSequence();
  };
};

const createDitbinmasRecapAndCustomSequenceHandler = waGatewayClient => {
  return async () => {
    try {
      await waitForWaGatewayReadyWithTimeout(waGatewayClient, DIRREQUEST_WA_READY_TIMEOUT_MS);
    } catch (error) {
      console.warn(
        `[CRON] Ditbinmas recap + custom sequence skipped: WA gateway readiness timeout after ${DIRREQUEST_WA_READY_TIMEOUT_MS}ms`,
        error,
      );
      return;
    }

    return runDitbinmasRecapAndCustomSequence();
  };
};

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
      //{ cronExpression: '30 18 * * *', handler: () => runFetchDirRequest(), options: DEFAULT_CRON_OPTIONS },
      { cronExpression: '0,30 19 * * *', handler: () => runFetchDirRequest(), options: DEFAULT_CRON_OPTIONS },
      { cronExpression: '0 20 * * *', handler: () => runFetchDirRequest(), options: DEFAULT_CRON_OPTIONS },
      { cronExpression: '0,30 21 * * *', handler: () => runFetchDirRequest(), options: DEFAULT_CRON_OPTIONS },


    ],
  },
  {
    jobKey: NOTIFICATION_REMINDER_JOB_KEY,
    description:
      'Send WhatsApp task reminders to Ditbinmas users who opted in, with nightly follow-ups for incomplete tasks.',
    schedules: [
      { cronExpression: '10 16 * * *', handler: () => runNotificationReminder(), options: DEFAULT_CRON_OPTIONS },
      { cronExpression: '40 16 * * *', handler: () => runNotificationReminder(), options: DEFAULT_CRON_OPTIONS },
      { cronExpression: '10 17 * * *', handler: () => runNotificationReminder(), options: DEFAULT_CRON_OPTIONS },
      { cronExpression: '40 17 * * *', handler: () => runNotificationReminder(), options: DEFAULT_CRON_OPTIONS },
      //{ cronExpression: '10 19 * * *', handler: () => runNotificationReminder(), options: DEFAULT_CRON_OPTIONS },
      //{ cronExpression: '40 19 * * *', handler: () => runNotificationReminder(), options: DEFAULT_CRON_OPTIONS },
      //{ cronExpression: '10 20 * * *', handler: () => runNotificationReminder(), options: DEFAULT_CRON_OPTIONS },
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
      'Run dirRequest custom sequence: sosmed fetch, Ditsamapta menus 6/9/28/29 (plus extras), Ditbinmas combined recap (menu 21), then Bidhumas menus 6/9/28/29 to group + super admin.',
    schedules: [
      { cronExpression: '0 15 * * *', handler: () => runDirRequestCustomSequence(), options: DEFAULT_CRON_OPTIONS },
      { cronExpression: '05 18 * * *', handler: () => runDirRequestCustomSequence(), options: DEFAULT_CRON_OPTIONS },
    ],
  },
  {
    jobKey: DITBINMAS_RECAP_AND_CUSTOM_JOB_KEY,
    description:
      'Fetch sosmed + recap Ditbinmas + cron custom di slot 18:00 tanpa duplikasi job recap terpisah.',
    schedules: [
      {
        cronExpression: '20 18 * * *',
        handler: () => runDitbinmasRecapAndCustomSequence(),
        options: DEFAULT_CRON_OPTIONS,
      },
    ],
  },

  {
    jobKey: BIDHUMAS_EVENING_JOB_KEY,
    description:
      'Send Bidhumas 22.00 evening recap..',
    schedules: [
      { cronExpression: '30 20 * * *', handler: () => runBidhumasEvening(), options: DEFAULT_CRON_OPTIONS },
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

  const scheduledJobs = [];
  const dirRequestCustomSequenceHandler = createDirRequestCustomSequenceHandler(waGatewayClient);
  const ditbinmasRecapAndCustomSequenceHandler =
    createDitbinmasRecapAndCustomSequenceHandler(waGatewayClient);

  dirRequestCrons.forEach(({ jobKey, description, schedules }) => {
    schedules.forEach(({ cronExpression, handler, options }) => {
      const resolvedHandler =
        jobKey === DIRREQUEST_CUSTOM_SEQUENCE_JOB_KEY
          ? dirRequestCustomSequenceHandler
          : jobKey === DITBINMAS_RECAP_AND_CUSTOM_JOB_KEY
            ? ditbinmasRecapAndCustomSequenceHandler
            : handler;
      console.log(`[CRON] Registering ${jobKey} (${description}) at ${cronExpression}`);
      scheduledJobs.push(scheduleCronJob(jobKey, cronExpression, resolvedHandler, options));
    });
  });

  return scheduledJobs;
}
