import { jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';

const mockQuery = jest.fn();
const mockRedis = { sAdd: jest.fn(), set: jest.fn() };

jest.unstable_mockModule('../src/db/index.js', () => ({
  query: mockQuery
}));

jest.unstable_mockModule('../src/config/redis.js', () => ({
  default: mockRedis
}));

jest.unstable_mockModule('../src/service/waService.js', () => ({
  default: { sendMessage: jest.fn() },
  waReady: false
}));

let app;
let authRoutes;

beforeAll(async () => {
  process.env.JWT_SECRET = 'testsecret';
  const mod = await import('../src/routes/authRoutes.js');
  authRoutes = mod.default;
  app = express();
  app.use(express.json());
  app.use('/api/auth', authRoutes);
});

beforeEach(() => {
  mockQuery.mockReset();
  mockRedis.sAdd.mockReset();
  mockRedis.set.mockReset();
});

describe('POST /login', () => {
  test('returns token and client data on success', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ client_id: '1', nama: 'Client', client_operator: '0812' }]
    });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ client_id: '1', client_operator: '0812' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.client).toEqual({ client_id: '1', nama: 'Client', role: 'client' });
    const token = res.body.token;
    expect(typeof token).toBe('string');
    expect(mockRedis.sAdd).toHaveBeenCalledWith(`login:1`, token);
    expect(mockRedis.set).toHaveBeenCalledWith(`login_token:${token}`, '1', { EX: 2 * 60 * 60 });
  });

  test('returns 401 when client not found', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ client_id: '9', client_operator: '0812' });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(mockRedis.sAdd).not.toHaveBeenCalled();
    expect(mockRedis.set).not.toHaveBeenCalled();
  });
});
