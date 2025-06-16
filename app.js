import express from 'express';
import morgan from 'morgan';
import { env } from './src/config/env.js';
import cors from 'cors';
import routes from './src/routes/index.js';
import authRoutes from './src/routes/authRoutes.js';
import { notFound, errorHandler } from './src/middleware/errorHandler.js';
import { authRequired } from './src/middleware/authMiddleware.js';
import { dedupRequest } from './src/middleware/dedupRequestMiddleware.js';

// Import semua cron jobs (jalankan di background)
import './src/cron/cronInstaService.js';
import './src/cron/cronTiktokService.js';
import './src/cron/cronInstaLaphar.js';
import './src/cron/cronTiktokLaphar.js';
import './src/cron/cronNotifikasiLikesDanKomentar.js';

const app = express();

app.use(cors({
  origin: env.CORS_ORIGIN,
  credentials: true,
}));

app.use(express.json());
app.use(morgan('dev'));
app.use(dedupRequest);

// ===== ROUTE LOGIN (TANPA TOKEN) =====
app.use('/api/auth', authRoutes);

// ===== ROUTE LAIN (WAJIB TOKEN) =====
app.use('/api', authRequired, routes);

// Handler NotFound dan Error
app.use(notFound);
app.use(errorHandler);

const PORT = env.PORT;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
