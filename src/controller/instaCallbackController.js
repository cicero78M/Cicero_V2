import { env } from '../config/env.js';

export function verifyWebhook(req, res) {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === env.IG_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.status(403).send('Forbidden');
}

export function receiveWebhook(req, res) {
  console.log('[IG WEBHOOK]', JSON.stringify(req.body));
  res.status(200).json({ received: true });
}
