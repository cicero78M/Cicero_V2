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
    router.get('/clients/profile', (req, res) => res.json({ success: true }));
    router.get('/users/list', (req, res) => res.json({ success: true }));
    router.post('/users/list', (req, res) => res.json({ success: true }));
    router.get('/dashboard/stats', (req, res) => res.json({ success: true }));
    router.get('/amplify/rekap', (req, res) => res.json({ success: true }));
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

  test('allows operator role on client profile route', async () => {
    const token = jwt.sign({ user_id: 'o1', role: 'operator' }, process.env.JWT_SECRET);
    const res = await request(app)
      .get('/api/clients/profile')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  test('allows operator role on user directory route', async () => {
    const token = jwt.sign({ user_id: 'o1', role: 'operator' }, process.env.JWT_SECRET);
    const res = await request(app)
      .get('/api/users/list')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  test('allows operator role on dashboard stats route', async () => {
    const token = jwt.sign({ user_id: 'o1', role: 'operator' }, process.env.JWT_SECRET);
    const res = await request(app)
      .get('/api/dashboard/stats')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  test('allows operator role on amplify rekap route', async () => {
    const token = jwt.sign({ user_id: 'o1', role: 'operator' }, process.env.JWT_SECRET);
    const res = await request(app)
      .get('/api/amplify/rekap')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  test('blocks operator role on disallowed methods', async () => {
    const token = jwt.sign({ user_id: 'o1', role: 'operator' }, process.env.JWT_SECRET);
    const res = await request(app)
      .post('/api/users/list')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
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
