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

describe('POST /penmas-register', () => {
  test('creates new user when username free', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ user_id: 'u1' }] });

    const res = await request(app)
      .post('/api/auth/penmas-register')
      .send({ username: 'user', password: 'pass' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(typeof res.body.user_id).toBe('string');
    expect(mockQuery).toHaveBeenNthCalledWith(
      1,
      'SELECT * FROM penmas_user WHERE username = $1',
      ['user']
    );
    expect(mockQuery).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('INSERT INTO penmas_user'),
      [expect.any(String), 'user', expect.any(String), 'penulis']
    );
  });

  test('returns 400 when username exists', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ user_id: 'x' }] });

    const res = await request(app)
      .post('/api/auth/penmas-register')
      .send({ username: 'user', password: 'pass' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });
});
