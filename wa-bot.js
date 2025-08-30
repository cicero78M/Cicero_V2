import './src/utils/logger.js';
import express from 'express';
import cors from 'cors';
import { waClient } from './src/service/waService.js';
import { sendWAReport } from './src/utils/waHelper.js';

const cronModules = [
  './src/cron/cronInstaService.js',
  './src/cron/cronTiktokService.js',
  './src/cron/cronInstaLaphar.js',
  './src/cron/cronTiktokLaphar.js',
  './src/cron/cronNotifikasiLikesDanKomentar.js',
  './src/cron/cronInstaDataMining.js',
  './src/cron/cronPremiumSubscription.js',
  './src/cron/cronRekapLink.js',
  './src/cron/cronAmplifyLinkMonthly.js',
  './src/cron/cronPremiumRequest.js',
  './src/cron/cronAbsensiUserData.js',
  './src/cron/cronAbsensiOprDitbinmas.js',
  './src/cron/cronDirRequest.js',
  './src/cron/cronDbBackup.js',
];

waClient.on('ready', async () => {
  await Promise.all(cronModules.map(m => import(m)));
});

const app = express();
app.use(cors());
app.use(express.json());

app.post('/send', async (req, res) => {
  const { to, message, options } = req.body || {};
  if (!to || !message) {
    return res.status(400).json({ success: false, message: 'to and message required' });
  }
  try {
    await waClient.sendMessage(to, message, options);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/broadcast', async (req, res) => {
  const { message, chatIds } = req.body || {};
  if (!message) {
    return res.status(400).json({ success: false, message: 'message required' });
  }
  try {
    await sendWAReport(waClient, message, chatIds);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

const PORT = process.env.WA_PORT || 3001;
app.listen(PORT, () => console.log(`WA service running on port ${PORT}`));
