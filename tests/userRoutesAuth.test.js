import { jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';

let app;

beforeAll(async () => {
  process.env.JWT_SECRET = 'testsecret';
  jest.unstable_mockModule('../src/controller/userController.js', () => ({
    getAllUsers: (req, res) => res.json({ success: true }),
    getUserList: (req, res) => res.json({ success: true }),
    getUsersByClient: (req, res) => res.json({ success: true }),
    getUsersByClientFull: (req, res) => res.json({ success: true }),
    createUser: (req, res) => res.json({ success: true }),
    updateUserRoles: (req, res) => res.json({ success: true }),
    getUserById: (req, res) => res.status(200).json({ success: true }),
    updateUser: (req, res) => res.json({ success: true }),
    deleteUser: (req, res) => res.json({ success: true }),
  }));
  const userRoutesMod = await import('../src/routes/userRoutes.js');
  const userRoutes = userRoutesMod.default;
  const { authRequired } = await import('../src/middleware/authMiddleware.js');
  app = express();
  app.use(express.json());
  const router = express.Router();
  router.use('/users', userRoutes);
  app.use('/api', authRequired, router);
});

test('GET /api/users/:id requires Authorization header', async () => {
  await request(app).get('/api/users/u1').expect(401);
  const token = jwt.sign({ user_id: 'u1', role: 'user' }, process.env.JWT_SECRET);
  await request(app)
    .get('/api/users/u1')
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
});

