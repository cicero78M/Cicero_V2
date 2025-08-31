import request from 'supertest';
import express from 'express';
import { jest } from '@jest/globals';

const mockGetRekap = jest.fn();
jest.unstable_mockModule('../src/model/instaLikeModel.js', () => ({
  getRekapLikesByClient: mockGetRekap
}));
jest.unstable_mockModule('../src/middleware/debugHandler.js', () => ({
  sendConsoleDebug: jest.fn()
}));

let likesRoutes;
beforeAll(async () => {
  ({ default: likesRoutes } = await import('../src/routes/likesRoutes.js'));
});

beforeEach(() => {
  mockGetRekap.mockReset();
});

test('GET /likes/instagram returns ditbinmas like summary', async () => {
  const rows = [
    { username: 'alice', jumlah_like: 4 },
    { username: 'bob', jumlah_like: 1 },
    { username: 'charlie', jumlah_like: 0 },
    { username: null, jumlah_like: 0 }
  ];
  mockGetRekap.mockResolvedValue({ rows, totalKonten: 4 });

  const app = express();
  app.use('/api/likes', likesRoutes);

  const res = await request(app).get('/api/likes/instagram');

  expect(res.status).toBe(200);
  expect(mockGetRekap).toHaveBeenCalledWith('ditbinmas', 'harian', undefined, undefined, undefined, 'ditbinmas');
  expect(res.body).toEqual(
    expect.objectContaining({
      sudahUsers: ['alice'],
      kurangUsers: ['bob'],
      belumUsers: ['charlie'],
      sudahUsersCount: 1,
      kurangUsersCount: 1,
      belumUsersCount: 2,
      noUsernameUsersCount: 1,
      usersCount: 4,
      totalPosts: 4,
      success: true
    })
  );
});
