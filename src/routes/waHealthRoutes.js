import express from 'express';
import { getWaReadinessSummary } from '../service/waService.js';

const router = express.Router();

router.get('/', (req, res) => {
  const { clients, shouldInitWhatsAppClients } = getWaReadinessSummary();
  res.status(200).json({
    status: 'ok',
    shouldInitWhatsAppClients,
    clients,
  });
});

export default router;
