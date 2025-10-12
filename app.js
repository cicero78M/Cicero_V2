import './src/utils/logger.js';
import express from 'express';
import morgan from 'morgan';
import { env } from './src/config/env.js';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import routes from './src/routes/index.js';
import authRoutes from './src/routes/authRoutes.js';
import passwordResetAliasRoutes from './src/routes/passwordResetAliasRoutes.js';
import claimRoutes from './src/routes/claimRoutes.js';
import { notFound, errorHandler } from './src/middleware/errorHandler.js';
import { authRequired } from './src/middleware/authMiddleware.js';
import { dedupRequest } from './src/middleware/dedupRequestMiddleware.js';
import { waClient, waGatewayClient } from './src/service/waService.js';
import { startOtpWorker } from './src/service/otpQueue.js';

const cronBuckets = {
  always: [
    './src/cron/cronDbBackup.js',
  ],
  waClient: [
    './src/cron/cronInstaService.js',
    './src/cron/cronInstaLaphar.js',
    './src/cron/cronRekapLink.js',
    './src/cron/cronAmplifyLinkMonthly.js',
    './src/cron/cronDirRequestRekapUpdate.js',
  ],
  waGateway: [
    './src/cron/cronDirRequestFetchSosmed.js',
    './src/cron/cronDirRequestRekapAllSocmed.js',
    './src/cron/cronDirRequestSosmedRank.js',
    './src/cron/cronDirRequestEngageRank.js',
    './src/cron/cronDirRequestLapharKasatker.js',
    './src/cron/cronDirRequestDirektorat.js',
  ],
};

const loadedCronModules = new Set();

async function loadCronModules(modules = []) {
  const pendingModules = modules.filter(modulePath => !loadedCronModules.has(modulePath));
  if (!pendingModules.length) return false;

  await Promise.all(pendingModules.map(async modulePath => {
    await import(modulePath);
    loadedCronModules.add(modulePath);
    console.log(`[CRON] Activated ${modulePath}`);
  }));

  return true;
}

function logBucketStatus(label, activated) {
  const status = activated ? 'activated' : 'already active';
  console.log(`[CRON] ${label} cron bucket ${status}`);
}

function scheduleCronBucket(client, bucketKey, label) {
  const modules = cronBuckets[bucketKey] || [];
  if (!modules.length) return;

  const activateBucket = () =>
    loadCronModules(modules)
      .then(activated => logBucketStatus(label, activated))
      .catch(err => console.error(`[CRON] Failed to activate ${label} cron bucket`, err));

  client.on('ready', () => {
    console.log(`[CRON] ${label} client ready event`);
    activateBucket();
  });

  client
    .waitForWaReady()
    .then(() => {
      console.log(`[CRON] ${label} client ready`);
      return activateBucket();
    })
    .catch(err => console.error(`[CRON] Error waiting for ${label} readiness`, err));
}

loadCronModules(cronBuckets.always)
  .then(activated => logBucketStatus('Always', activated))
  .catch(err => console.error('[CRON] Failed to activate always cron bucket', err));

scheduleCronBucket(waClient, 'waClient', 'WA client');
scheduleCronBucket(waGatewayClient, 'waGateway', 'WA gateway client');

startOtpWorker().catch(err => console.error('[OTP] worker error', err));

const app = express();
app.disable('etag');

app.use(cors({
  origin: env.CORS_ORIGIN,
  credentials: true,
}));

app.use(express.json());
app.use(cookieParser());
app.use(morgan('dev'));
app.use(dedupRequest);

// ===== ROUTE LOGIN (TANPA TOKEN) =====
app.use('/api/auth', authRoutes);
app.use('/api/claim', claimRoutes);
app.use('/api/password-reset', passwordResetAliasRoutes);

// ===== ROUTE LAIN (WAJIB TOKEN) =====
app.use('/api', authRequired, routes);

// Handler NotFound dan Error
app.use(notFound);
app.use(errorHandler);

const PORT = env.PORT;
app.listen(PORT, () => console.log(`Backend server running on port ${PORT}`));
