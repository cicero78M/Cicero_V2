import cron from 'node-cron';
let cronJobServicePromise;

function loadCronJobService() {
  if (!cronJobServicePromise) {
    cronJobServicePromise = import('../service/cronJobConfigService.js');
  }
  return cronJobServicePromise;
}

const DEFAULT_LOG_PREFIX = '[CRON]';

function log(message, ...args) {
  console.log(`${DEFAULT_LOG_PREFIX} ${message}`, ...args);
}

function logError(message, error) {
  console.error(`${DEFAULT_LOG_PREFIX} ${message}`, error);
}

export function scheduleCronJob(jobKey, cronExpression, handler, options = {}) {
  if (!jobKey) {
    throw new Error('jobKey is required for scheduleCronJob');
  }
  if (typeof handler !== 'function') {
    throw new TypeError('handler must be a function');
  }

  return cron.schedule(
    cronExpression,
    async (...args) => {
      try {
        const { getCronJob } = await loadCronJobService();
        const config = await getCronJob(jobKey);
        if (config && config.is_active === false) {
          log(`Skipping job ${jobKey} because it is inactive.`);
          return;
        }
      } catch (err) {
        logError(`Failed to check status for job ${jobKey}.`, err);
        return;
      }

      try {
        await handler(...args);
      } catch (err) {
        logError(`Handler for job ${jobKey} failed.`, err);
      }
    },
    options,
  );
}
