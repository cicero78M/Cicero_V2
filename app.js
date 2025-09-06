import './src/utils/logger.js';
import express from 'express';
import morgan from 'morgan';
import { env } from './src/config/env.js';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import routes from './src/routes/index.js';
import authRoutes from './src/routes/authRoutes.js';
import claimRoutes from './src/routes/claimRoutes.js';
import { notFound, errorHandler } from './src/middleware/errorHandler.js';
import { authRequired } from './src/middleware/authMiddleware.js';
import { dedupRequest } from './src/middleware/dedupRequestMiddleware.js';
import { waClient } from './src/service/waService.js';
import { startOtpWorker } from './src/service/otpQueue.js';

// Import semua cron jobs setelah WhatsApp siap
const cronModules = [
  './src/cron/cronInstaService.js',
  './src/cron/cronTiktokService.js',
  './src/cron/cronInstaLaphar.js',
  './src/cron/cronTiktokLaphar.js',
  './src/cron/cronInstaDataMining.js',
  './src/cron/cronRekapLink.js',
  './src/cron/cronAmplifyLinkMonthly.js',
    './src/cron/cronDirRequestFetchInsta.js',
    './src/cron/cronDirRequestRekapUpdate.js',
    './src/cron/cronDirRequestRekapLaphar.js',
    './src/cron/cronDbBackup.js',
  ];

waClient.on('ready', async () => {
  await Promise.all(cronModules.map(m => import(m)));
});

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

// ===== ROUTE LAIN (WAJIB TOKEN) =====
app.use('/api', authRequired, routes);

// Handler NotFound dan Error
app.use(notFound);
app.use(errorHandler);

const PORT = env.PORT;
app.listen(PORT, () => console.log(`Backend server running on port ${PORT}`));
