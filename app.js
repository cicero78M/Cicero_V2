import express from 'express';
import morgan from 'morgan';
import dotenv from 'dotenv';
import cors from 'cors';
import routes from './src/routes/index.js';
import authRoutes from './src/routes/authRoutes.js';        // <--- tambahkan
import { notFound, errorHandler } from './src/middleware/errorHandler.js';
import { authRequired } from './src/middleware/authMiddleware.js'; // <--- tambahkan
import { dedupRequest } from './src/middleware/dedupRequestMiddleware.js';

// Load environment variables dulu
dotenv.config();

// Import semua cron jobs (jalankan di background)
import './src/cron/cronInstaService.js';
import './src/cron/cronTiktokService.js';
import './src/cron/cronInstaLaphar.js';
import './src/cron/cronTiktokLaphar.js';

const app = express();




// === CORS agar Next.js (beda domain/port) bisa akses API ===
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*', // Production: ganti jadi url Next.js-mu
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
