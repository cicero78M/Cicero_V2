import { jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';

let app;

beforeAll(async () => {
  process.env.JWT_SECRET = 'testsecret';
  jest.unstable_mockModule('../src/controller/claimController.js', () => ({
    requestOtp: (req, res) => res.status(202).json({ success: true }),
    verifyOtpController: (req, res) => res.status(200).json({ success: true }),
    updateUserData: (req, res) => res.status(200).json({ success: true })
  }));
  const claimMod = await import('../src/routes/claimRoutes.js');
  const claimRoutes = claimMod.default;
  const { authRequired } = await import('../src/middleware/authMiddleware.js');
  app = express();
  app.use(express.json());
  app.use('/api/claim', claimRoutes);
  const router = express.Router();
  router.get('/protected', (req, res) => res.json({ success: true }));
  app.use('/api', authRequired, router);
});

describe('claim routes access', () => {
  test('allows access without token', async () => {
    await request(app).post('/api/claim/request-otp').send({ nrp: '1', whatsapp: '1' }).expect(202);
    await request(app).post('/api/claim/verify-otp').send({ nrp: '1', whatsapp: '1', otp: '123' }).expect(200);
    await request(app).put('/api/claim/update').send({ nrp: '1', whatsapp: '1' }).expect(200);
  });

  test('blocks other routes without token', async () => {
    const res = await request(app).get('/api/protected');
    expect(res.status).toBe(401);
    const token = jwt.sign({ user_id: 'u1', role: 'user' }, process.env.JWT_SECRET);
    const res2 = await request(app).get('/api/protected').set('Authorization', `Bearer ${token}`);
    expect(res2.status).toBe(200);
  });
});
