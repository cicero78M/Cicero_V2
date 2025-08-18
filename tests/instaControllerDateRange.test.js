import { jest } from '@jest/globals';

const mockGetRekap = jest.fn();
jest.unstable_mockModule('../src/model/instaLikeModel.js', () => ({
  getRekapLikesByClient: mockGetRekap
}));
jest.unstable_mockModule('../src/middleware/debugHandler.js', () => ({
  sendConsoleDebug: jest.fn()
}));
jest.unstable_mockModule('../src/service/instaPostService.js', () => ({}));
jest.unstable_mockModule('../src/service/instaPostKhususService.js', () => ({}));
jest.unstable_mockModule('../src/service/instagramApi.js', () => ({
  fetchInstagramPosts: jest.fn(),
  fetchInstagramProfile: jest.fn(),
  fetchInstagramInfo: jest.fn(),
  fetchInstagramPostsByMonthToken: jest.fn(),
}));
jest.unstable_mockModule('../src/service/instaProfileService.js', () => ({}));
jest.unstable_mockModule('../src/service/instagramUserService.js', () => ({}));
jest.unstable_mockModule('../src/service/instaPostCacheService.js', () => ({}));
jest.unstable_mockModule('../src/service/profileCacheService.js', () => ({}));
jest.unstable_mockModule('../src/utils/response.js', () => ({ sendSuccess: jest.fn() }));

let getInstaRekapLikes;
beforeAll(async () => {
  ({ getInstaRekapLikes } = await import('../src/controller/instaController.js'));
});

beforeEach(() => {
  mockGetRekap.mockReset();
});

test('accepts tanggal_mulai and tanggal_selesai', async () => {
  mockGetRekap.mockResolvedValue([]);
  const req = {
    query: {
      client_id: 'c1',
      periode: 'harian',
      tanggal_mulai: '2024-01-01',
      tanggal_selesai: '2024-01-31'
    }
  };
  const json = jest.fn();
  const res = { json };
  await getInstaRekapLikes(req, res);
  expect(mockGetRekap).toHaveBeenCalledWith('c1', 'harian', undefined, '2024-01-01', '2024-01-31', undefined, undefined);
  expect(json).toHaveBeenCalledWith(expect.objectContaining({ chartHeight: 300 }));
});

test('returns 403 when client_id unauthorized', async () => {
  const req = {
    query: { client_id: 'c2' },
    user: { client_ids: ['c1'] }
  };
  const json = jest.fn();
  const res = { json, status: jest.fn().mockReturnThis() };
  await getInstaRekapLikes(req, res);
  expect(res.status).toHaveBeenCalledWith(403);
  expect(json).toHaveBeenCalledWith({ success: false, message: 'client_id tidak diizinkan' });
  expect(mockGetRekap).not.toHaveBeenCalled();
});

test('allows authorized client_id', async () => {
  mockGetRekap.mockResolvedValue([]);
  const req = {
    query: { client_id: 'c1' },
    user: { client_ids: ['c1', 'c2'] }
  };
  const json = jest.fn();
  const res = { json, status: jest.fn().mockReturnThis() };
  await getInstaRekapLikes(req, res);
  expect(res.status).not.toHaveBeenCalledWith(403);
  expect(mockGetRekap).toHaveBeenCalledWith('c1', 'harian', undefined, undefined, undefined, undefined, undefined);
  expect(json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
});

test('returns user like summaries', async () => {
  const rows = [
    { username: 'alice', jumlah_like: 3 },
    { username: 'bob', jumlah_like: 0 },
    { username: 'charlie', jumlah_like: 1 }
  ];
  mockGetRekap.mockResolvedValue(rows);
  const req = {
    query: { client_id: 'c1' },
    user: { client_ids: ['c1'] }
  };
  const json = jest.fn();
  const res = { json, status: jest.fn().mockReturnThis() };
  await getInstaRekapLikes(req, res);
  expect(json).toHaveBeenCalledWith(
    expect.objectContaining({
      usersWithLikes: ['alice', 'charlie'],
      usersWithoutLikes: ['bob'],
      usersWithLikesCount: 2,
      usersWithoutLikesCount: 1
    })
  );
});

