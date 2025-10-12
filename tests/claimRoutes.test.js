import { jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';

function createRedisMock() {
  return {
    set: jest.fn().mockResolvedValue(),
    get: jest.fn().mockResolvedValue(null),
    del: jest.fn().mockResolvedValue(),
    ttl: jest.fn().mockResolvedValue(0),
    on: jest.fn(),
    connect: jest.fn().mockResolvedValue(),
    quit: jest.fn().mockResolvedValue(),
  };
}

describe('claim routes access', () => {
  let app;

  beforeAll(async () => {
    process.env.JWT_SECRET = 'testsecret';
    await jest.isolateModulesAsync(async () => {
      jest.unstable_mockModule('../src/config/redis.js', () => ({
        default: createRedisMock(),
      }));
      jest.unstable_mockModule('../src/service/otpService.js', () => ({
        generateOtp: jest.fn().mockResolvedValue('123456'),
        verifyOtp: jest.fn().mockResolvedValue(true),
        isVerified: jest.fn().mockResolvedValue(true),
        clearVerification: jest.fn().mockResolvedValue(),
      }));
      jest.unstable_mockModule('../src/model/userModel.js', () => ({
        findUserById: jest.fn().mockResolvedValue({ email: 'a@a.com' }),
        updateUserField: jest.fn().mockResolvedValue(),
        updateUser: jest.fn().mockResolvedValue({ success: true }),
      }));
      jest.unstable_mockModule('../src/service/otpQueue.js', () => ({
        enqueueOtp: jest.fn().mockResolvedValue(),
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
  });

  afterAll(() => {
    jest.resetModules();
  });

  test('allows access without token', async () => {
    await request(app).post('/api/claim/request-otp').send({ nrp: '1', email: 'a@a.com' }).expect(202);
    await request(app)
      .post('/api/claim/verify-otp')
      .send({ nrp: '1', email: 'a@a.com', otp: '123' })
      .expect(200);
    await request(app).post('/api/claim/user-data').send({ nrp: '1', email: 'a@a.com' }).expect(200);
    await request(app).put('/api/claim/update').send({ nrp: '1', email: 'a@a.com' }).expect(200);
  });

  test('blocks other routes without token', async () => {
    const res = await request(app).get('/api/protected');
    expect(res.status).toBe(401);
    const token = jwt.sign({ user_id: 'u1', role: 'user' }, process.env.JWT_SECRET);
    const res2 = await request(app).get('/api/protected').set('Authorization', `Bearer ${token}`);
    expect(res2.status).toBe(200);
  });
});

describe('claim update validation', () => {
  let app;
  let serviceMocks;

  beforeEach(async () => {
    jest.resetModules();
    serviceMocks = {
      isVerified: jest.fn().mockResolvedValue(false),
      verifyOtp: jest.fn().mockResolvedValue(false),
      clearVerification: jest.fn().mockResolvedValue(),
    };
    await jest.isolateModulesAsync(async () => {
      jest.unstable_mockModule('../src/config/redis.js', () => ({
        default: createRedisMock(),
      }));
      jest.unstable_mockModule('../src/service/otpService.js', () => ({
        generateOtp: jest.fn(),
        verifyOtp: serviceMocks.verifyOtp,
        isVerified: serviceMocks.isVerified,
        clearVerification: serviceMocks.clearVerification,
      }));
      jest.unstable_mockModule('../src/model/userModel.js', () => ({
        findUserById: jest.fn(),
        updateUserField: jest.fn(),
        updateUser: jest.fn().mockResolvedValue({ success: true }),
      }));
      jest.unstable_mockModule('../src/service/otpQueue.js', () => ({
        enqueueOtp: jest.fn(),
      }));
      const claimMod = await import('../src/routes/claimRoutes.js');
      const claimRoutes = claimMod.default;
      app = express();
      app.use(express.json());
      app.use('/api/claim', claimRoutes);
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('returns 400 when instagram format invalid', async () => {
    const res = await request(app)
      .put('/api/claim/update')
      .send({ nrp: '1', email: 'a@a.com', insta: 'not a handle' });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      success: false,
      message:
        'Format username Instagram tidak valid. Gunakan tautan profil atau username seperti instagram.com/username atau @username.',
    });
    expect(serviceMocks.isVerified).not.toHaveBeenCalled();
    expect(serviceMocks.verifyOtp).not.toHaveBeenCalled();
  });

  test('returns 400 when tiktok format invalid', async () => {
    const res = await request(app)
      .put('/api/claim/update')
      .send({ nrp: '1', email: 'a@a.com', tiktok: 'tiktok.com/user' });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      success: false,
      message:
        'Format username TikTok tidak valid. Gunakan tautan profil atau username seperti tiktok.com/@username atau @username.',
    });
    expect(serviceMocks.isVerified).not.toHaveBeenCalled();
    expect(serviceMocks.verifyOtp).not.toHaveBeenCalled();
  });
});
