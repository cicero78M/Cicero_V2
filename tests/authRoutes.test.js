import { jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import bcrypt from 'bcrypt';

const mockQuery = jest.fn();
const mockRedis = { sAdd: jest.fn(), set: jest.fn() };
const mockInsertLoginLog = jest.fn();
const mockSendMessage = jest.fn();
const actualWaHelper = await import('../src/utils/waHelper.js');

jest.unstable_mockModule('../src/db/index.js', () => ({
  query: mockQuery
}));

jest.unstable_mockModule('../src/config/redis.js', () => ({
  default: mockRedis
}));

jest.unstable_mockModule('../src/model/loginLogModel.js', () => ({
  insertLoginLog: mockInsertLoginLog,
  getLoginLogs: jest.fn()
}));

jest.unstable_mockModule('../src/utils/waHelper.js', () => ({
  ...actualWaHelper,
  getAdminWAIds: () => ['admin@c.us'],
  formatToWhatsAppId: (nohp) => `${nohp}@c.us`
}));

jest.unstable_mockModule('../src/service/waApiClient.js', () => ({
  sendMessage: mockSendMessage,
  sendReport: jest.fn()
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
  mockInsertLoginLog.mockReset();
  mockSendMessage.mockReset();
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
    expect(mockInsertLoginLog).toHaveBeenCalledWith({
      actorId: '1',
      loginType: 'operator',
      loginSource: 'mobile'
    });
  });

  test('sets role to client_id for direktorat client', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          client_id: 'DIT1',
          nama: 'Dit',
          client_operator: '0812',
          client_type: 'direktorat'
        }
      ]
    });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ client_id: 'DIT1', client_operator: '0812' });

    expect(res.status).toBe(200);
    expect(res.body.client).toEqual({ client_id: 'DIT1', nama: 'Dit', role: 'dit1' });
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
    expect(mockInsertLoginLog).toHaveBeenCalledWith({
      actorId: 'u1',
      loginType: 'operator',
      loginSource: 'web'
    });
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
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ user_id: '1', ditbinmas: false, ditlantas: false, bidhumas: false }] });

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
    expect(mockQuery.mock.calls[1][0]).toContain('INSERT INTO "user"');
    expect(mockQuery.mock.calls.length).toBe(3);
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
      .mockResolvedValueOnce({ rows: [{ role_id: 1, role_name: 'operator' }] })
      .mockResolvedValueOnce({ rows: [{ dashboard_user_id: 'd1', status: false }] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post('/api/auth/dashboard-register')
      .send({ username: 'dash', password: 'pass', whatsapp: '0812-1234x', client_ids: ['c1'] });

    expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.status).toBe(false);
      expect(res.body.dashboard_user_id).toBeDefined();
      expect(mockQuery).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('FROM dashboard_user'),
        ['dash']
      );
      expect(mockQuery.mock.calls[1][0]).toContain('FROM roles');
      expect(mockQuery).toHaveBeenNthCalledWith(
        3,
        expect.stringContaining('INSERT INTO dashboard_user'),
        [expect.any(String), 'dash', expect.any(String), 1, false, null, '628121234']
      );
      expect(mockQuery).toHaveBeenNthCalledWith(
        4,
        expect.stringContaining('INSERT INTO dashboard_user_clients'),
        [expect.any(String), 'c1']
      );
      expect(mockSendMessage).toHaveBeenCalledTimes(2);
      expect(mockSendMessage).toHaveBeenCalledWith(
        'admin@c.us',
        expect.stringContaining('Permintaan User Approval')
      );
      expect(mockSendMessage).toHaveBeenCalledWith(
        '628121234@c.us',
        expect.stringContaining('Permintaan registrasi dashboard Anda telah diterima')
      );
  });

  test('accepts single client_id field', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ role_id: 1, role_name: 'operator' }] })
      .mockResolvedValueOnce({ rows: [{ dashboard_user_id: 'd1', status: false }] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post('/api/auth/dashboard-register')
      .send({ username: 'dash', password: 'pass', whatsapp: '0812-1234x', client_id: 'c1' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(mockQuery).toHaveBeenNthCalledWith(
      4,
      expect.stringContaining('INSERT INTO dashboard_user_clients'),
      [expect.any(String), 'c1']
    );
  });

  test('creates dashboard user with specified role name', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ role_id: 5, role_name: 'ditbinmas' }] })
      .mockResolvedValueOnce({ rows: [{ dashboard_user_id: 'd1', status: false }] });

    const res = await request(app)
      .post('/api/auth/dashboard-register')
      .send({ username: 'dash', password: 'pass', whatsapp: '0812-1234x', role: 'ditbinmas' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(mockQuery.mock.calls[1][0]).toContain('FROM roles');
    expect(mockQuery.mock.calls[1][1]).toEqual(['ditbinmas']);
    expect(mockQuery.mock.calls[2][1][3]).toBe(5);
    expect(mockSendMessage).toHaveBeenCalledTimes(2);
  });

  test('creates default role when missing', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ role_id: 2, role_name: 'operator' }] })
      .mockResolvedValueOnce({ rows: [{ dashboard_user_id: 'd1', status: false }] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post('/api/auth/dashboard-register')
      .send({ username: 'dash', password: 'pass', whatsapp: '0812-1234x', client_ids: ['c1'] });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(mockQuery).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('FROM roles'),
      ['operator']
    );
    expect(mockQuery).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('INSERT INTO roles'),
      ['operator']
    );
    expect(mockQuery).toHaveBeenNthCalledWith(
      5,
      expect.stringContaining('INSERT INTO dashboard_user_clients'),
      [expect.any(String), 'c1']
    );
  });

  test('returns 400 when client_ids missing for operator', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ role_id: 1, role_name: 'operator' }] });

    const res = await request(app)
      .post('/api/auth/dashboard-register')
      .send({ username: 'dash', password: 'pass', whatsapp: '0812-1234x' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/minimal satu client harus dipilih/);
    expect(mockQuery).toHaveBeenCalledTimes(2);
  });

  test('returns 400 when whatsapp invalid', async () => {
    const res = await request(app)
      .post('/api/auth/dashboard-register')
      .send({ username: 'dash', password: 'pass', whatsapp: '123' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/whatsapp tidak valid/i);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  test('returns 400 when username exists', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ dashboard_user_id: 'x' }] });

    const res = await request(app)
      .post('/api/auth/dashboard-register')
      .send({ username: 'dash', password: 'pass', whatsapp: '0812-1234' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });
});

describe('POST /dashboard-login', () => {
  test('logs in dashboard user with correct password', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [
          {
            dashboard_user_id: 'd1',
            username: 'dash',
            password_hash: await bcrypt.hash('pass', 10),
            role: 'admin',
            role_id: 2,
            status: true,
            client_ids: ['c1'],
            user_id: null
          }
        ]
      })
      .mockResolvedValueOnce({ rows: [{ client_type: 'instansi' }] });

    const res = await request(app)
      .post('/api/auth/dashboard-login')
      .send({ username: 'dash', password: 'pass' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.user).toEqual({
      dashboard_user_id: 'd1',
      user_id: null,
      role: 'admin',
      role_id: 2,
      client_ids: ['c1'],
      client_id: 'c1'
    });
    expect(mockRedis.sAdd).toHaveBeenCalledWith('dashboard_login:d1', res.body.token);
    expect(mockRedis.set).toHaveBeenCalledWith(
      `login_token:${res.body.token}`,
      'dashboard:d1',
      { EX: 2 * 60 * 60 }
    );
    expect(mockInsertLoginLog).toHaveBeenCalledWith({
      actorId: 'd1',
      loginType: 'operator',
      loginSource: 'web'
    });
  });

  test('sets role to client_id for direktorat client', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [
          {
            dashboard_user_id: 'd1',
            username: 'dash',
            password_hash: await bcrypt.hash('pass', 10),
            role: 'admin',
            role_id: 2,
            status: true,
            client_ids: ['DIT1'],
            user_id: null
          }
        ]
      })
      .mockResolvedValueOnce({ rows: [{ client_type: 'direktorat' }] });

    const res = await request(app)
      .post('/api/auth/dashboard-login')
      .send({ username: 'dash', password: 'pass' });

    expect(res.status).toBe(200);
    expect(res.body.user).toEqual({
      dashboard_user_id: 'd1',
      user_id: null,
      role: 'dit1',
      role_id: 2,
      client_ids: ['DIT1'],
      client_id: 'DIT1'
    });
  });

  test('returns 400 when operator has no allowed clients', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
            {
              dashboard_user_id: 'd1',
              username: 'dash',
              password_hash: await bcrypt.hash('pass', 10),
              role: 'admin',
              role_id: 2,
              status: true,
              client_ids: [],
              user_id: null
            }
        ]
      });

    const res = await request(app)
      .post('/api/auth/dashboard-login')
      .send({ username: 'dash', password: 'pass' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe('Operator belum memiliki klien yang diizinkan');
    expect(mockRedis.sAdd).not.toHaveBeenCalled();
    expect(mockRedis.set).not.toHaveBeenCalled();
  });

  test('returns 401 when password wrong', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
            {
              dashboard_user_id: 'd1',
              username: 'dash',
              password_hash: await bcrypt.hash('pass', 10),
              role: 'admin',
              role_id: 2,
              status: true,
              client_ids: ['c1'],
              user_id: null
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


describe('POST /user-login', () => {
  test('logs in user with correct whatsapp', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ user_id: 'u1', nama: 'User' }]
    });

    const res = await request(app)
      .post('/api/auth/user-login')
      .send({ nrp: 'u1', whatsapp: '0808' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mockRedis.sAdd).toHaveBeenCalledWith('user_login:u1', res.body.token);
    expect(mockRedis.set).toHaveBeenCalledWith(
      `login_token:${res.body.token}`,
      'user:u1',
      { EX: 2 * 60 * 60 }
    );
    expect(mockInsertLoginLog).toHaveBeenCalledWith({
      actorId: 'u1',
      loginType: 'user',
      loginSource: 'mobile'
    });
  });
});
