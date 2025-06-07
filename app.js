import express from 'express';
import morgan from 'morgan';
import dotenv from 'dotenv';
import cors from 'cors';
import routes from './src/routes/index.js';
import { notFound, errorHandler } from './src/middleware/errorHandler.js';

// Pastikan environment variables sudah dimuat sebelum require file lain
dotenv.config();

// Import semua cron jobs
import './src/cron/cronInstaService.js';
import './src/cron/cronTiktokService.js';
import './src/cron/cronInstaLaphar.js';
import './src/cron/cronTiktokLaphar.js';

const app = express();

// === Tambahkan CORS agar bisa diakses dari Next.js (domain berbeda) ===
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*', // Ganti dengan URL dashboard Next.js untuk security, misal: 'https://dashboard.domainkamu.com'
  credentials: true,
}));

app.use(express.json());
app.use(morgan('dev'));
app.use('/api', routes);

// Handler NotFound dan Error
app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
