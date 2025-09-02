import { jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';
import { authRequired } from '../src/middleware/authMiddleware.js';

describe('authRequired middleware', () => {
  let app;

  beforeAll(() => {
    process.env.JWT_SECRET = 'testsecret';
    app = express();
    const router = express.Router();
    router.get('/claim/ok', (req, res) => res.json({ success: true }));
    router.get('/clients/data', (req, res) => res.json({ success: true }));
    router.get('/other', (req, res) => res.json({ success: true }));
    app.use('/api', authRequired, router);
  });

  test('allows operator role on claim routes', async () => {
    const token = jwt.sign({ user_id: 'o1', role: 'operator' }, process.env.JWT_SECRET);
    const res = await request(app)
      .get('/api/claim/ok')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('allows user role on client routes', async () => {
    const token = jwt.sign({ user_id: 'u1', role: 'user' }, process.env.JWT_SECRET);
    const res = await request(app)
      .get('/api/clients/data')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('blocks operator role on unauthorized routes', async () => {
    const token = jwt.sign({ user_id: 'o1', role: 'operator' }, process.env.JWT_SECRET);
    const res = await request(app)
      .get('/api/other')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  test('allows user role on non-claim routes', async () => {
    const token = jwt.sign({ user_id: 'u1', role: 'user' }, process.env.JWT_SECRET);
    const res = await request(app)
      .get('/api/other')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
