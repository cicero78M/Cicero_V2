import request from 'supertest';
import express from 'express';
import healthRoutes from '../src/routes/healthRoutes.js';

let app;

beforeAll(() => {
  app = express();
  app.use('/', healthRoutes);
});

describe('GET /health', () => {
  test('returns ok status', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
