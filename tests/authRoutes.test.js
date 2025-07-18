import { jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import bcrypt from 'bcrypt';

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

describe('POST /penmas-login', () => {
  test('logs in existing user with correct password', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          user_id: 'u1',
          username: 'user',
          password_hash: await bcrypt.hash('pass', 10),
          role: 'penulis'
        }
      ]
    });

    const res = await request(app)
      .post('/api/auth/penmas-login')
      .send({ username: 'user', password: 'pass' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(typeof res.body.token).toBe('string');
    expect(res.body.user).toEqual({ user_id: 'u1', role: 'penulis' });
    expect(mockRedis.sAdd).toHaveBeenCalledWith('penmas_login:u1', res.body.token);
    expect(mockRedis.set).toHaveBeenCalledWith(
      `login_token:${res.body.token}`,
      'penmas:u1',
      { EX: 2 * 60 * 60 }
    );
  });

  test('returns 401 when password wrong', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          user_id: 'u1',
          username: 'user',
          password_hash: await bcrypt.hash('pass', 10),
          role: 'penulis'
        }
      ]
    });

    const res = await request(app)
      .post('/api/auth/penmas-login')
      .send({ username: 'user', password: 'wrong' });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(mockRedis.sAdd).not.toHaveBeenCalled();
    expect(mockRedis.set).not.toHaveBeenCalled();
  });

  test('returns 403 when status pending', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          user_id: 'd1',
          username: 'dash',
          password_hash: await bcrypt.hash('pass', 10),
          role: 'admin',
          status: false
        }
      ]
    });

    const res = await request(app)
      .post('/api/auth/dashboard-login')
      .send({ username: 'dash', password: 'pass' });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(mockRedis.sAdd).not.toHaveBeenCalled();
    expect(mockRedis.set).not.toHaveBeenCalled();
  });
});

describe('POST /user-register', () => {
  test('creates new user when nrp free', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ user_id: '1' }] });

    const res = await request(app)
      .post('/api/auth/user-register')
      .send({ nrp: '1', nama: 'User', client_id: 'c1' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(mockQuery).toHaveBeenNthCalledWith(
      1,
      'SELECT * FROM "user" WHERE user_id = $1',
      ['1']
    );
    expect(mockQuery).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('INSERT INTO "user"'),
      expect.any(Array)
    );
  });

  test('returns 400 when nrp exists', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ user_id: '1' }] });

    const res = await request(app)
      .post('/api/auth/user-register')
      .send({ nrp: '1', nama: 'User', client_id: 'c1' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });
});

describe('POST /dashboard-register', () => {
  test('creates new dashboard user when username free', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ user_id: 'd1' }] });

    const res = await request(app)
      .post('/api/auth/dashboard-register')
      .send({ username: 'dash', password: 'pass' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(mockQuery).toHaveBeenNthCalledWith(
      1,
      'SELECT * FROM dashboard_user WHERE username = $1',
      ['dash']
    );
    expect(mockQuery).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('INSERT INTO dashboard_user'),
      [expect.any(String), 'dash', expect.any(String), 'operator', true, null]
    );
  });

  test('admin registration inserted as pending', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ user_id: 'a1', status: false }] });

    const res = await request(app)
      .post('/api/auth/dashboard-register')
      .send({ username: 'admin', password: 'pass', role: 'admin' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.status).toBe(false);
    expect(mockQuery).toHaveBeenNthCalledWith(
      1,
      'SELECT * FROM dashboard_user WHERE username = $1',
      ['admin']
    );
    expect(mockQuery).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('INSERT INTO dashboard_user'),
      [expect.any(String), 'admin', expect.any(String), 'admin', false, null]
    );
  });

  test('returns 400 when username exists', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ user_id: 'x' }] });

    const res = await request(app)
      .post('/api/auth/dashboard-register')
      .send({ username: 'dash', password: 'pass' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });
});

describe('POST /dashboard-login', () => {
  test('logs in dashboard user with correct password', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          user_id: 'd1',
          username: 'dash',
          password_hash: await bcrypt.hash('pass', 10),
          role: 'admin',
          status: true
        }
      ]
    });

    const res = await request(app)
      .post('/api/auth/dashboard-login')
      .send({ username: 'dash', password: 'pass' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mockRedis.sAdd).toHaveBeenCalledWith('dashboard_login:d1', res.body.token);
    expect(mockRedis.set).toHaveBeenCalledWith(
      `login_token:${res.body.token}`,
      'dashboard:d1',
      { EX: 2 * 60 * 60 }
    );
  });

  test('returns 401 when password wrong', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          user_id: 'd1',
          username: 'dash',
          password_hash: await bcrypt.hash('pass', 10),
          role: 'admin',
          status: true
        }
      ]
    });

    const res = await request(app)
      .post('/api/auth/dashboard-login')
      .send({ username: 'dash', password: 'wrong' });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(mockRedis.sAdd).not.toHaveBeenCalled();
    expect(mockRedis.set).not.toHaveBeenCalled();
  });
});

describe('POST /user-register', () => {
  test('creates new user when nrp free', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ user_id: '1' }] });

    const res = await request(app)
      .post('/api/auth/user-register')
      .send({ nrp: '1', nama: 'User', client_id: 'c1' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(mockQuery).toHaveBeenNthCalledWith(
      1,
      'SELECT * FROM "user" WHERE user_id = $1',
      ['1']
    );
    expect(mockQuery).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('INSERT INTO "user"'),
      expect.any(Array)
    );
  });

  test('returns 400 when nrp exists', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ user_id: '1' }] });

    const res = await request(app)
      .post('/api/auth/user-register')
      .send({ nrp: '1', nama: 'User', client_id: 'c1' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });
});

describe('POST /dashboard-register', () => {
  test('creates new dashboard user when username free', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ user_id: 'd1' }] });

    const res = await request(app)
      .post('/api/auth/dashboard-register')
      .send({ username: 'dash', password: 'pass' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(mockQuery).toHaveBeenNthCalledWith(
      1,
      'SELECT * FROM dashboard_user WHERE username = $1',
      ['dash']
    );
    expect(mockQuery).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('INSERT INTO dashboard_user'),
      [expect.any(String), 'dash', expect.any(String), 'operator', null]
    );
  });

  test('returns 400 when username exists', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ user_id: 'x' }] });

    const res = await request(app)
      .post('/api/auth/dashboard-register')
      .send({ username: 'dash', password: 'pass' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });
});

describe('POST /dashboard-login', () => {
  test('logs in dashboard user with correct password', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          user_id: 'd1',
          username: 'dash',
          password_hash: await bcrypt.hash('pass', 10),
          role: 'admin'
        }
      ]
    });

    const res = await request(app)
      .post('/api/auth/dashboard-login')
      .send({ username: 'dash', password: 'pass' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mockRedis.sAdd).toHaveBeenCalledWith('dashboard_login:d1', res.body.token);
    expect(mockRedis.set).toHaveBeenCalledWith(
      `login_token:${res.body.token}`,
      'dashboard:d1',
      { EX: 2 * 60 * 60 }
    );
  });

  test('returns 401 when password wrong', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          user_id: 'd1',
          username: 'dash',
          password_hash: await bcrypt.hash('pass', 10),
          role: 'admin'
        }
      ]
    });

    const res = await request(app)
      .post('/api/auth/dashboard-login')
      .send({ username: 'dash', password: 'wrong' });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(mockRedis.sAdd).not.toHaveBeenCalled();
    expect(mockRedis.set).not.toHaveBeenCalled();
  });
});
