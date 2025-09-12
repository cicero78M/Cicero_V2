import { jest } from '@jest/globals';

const mockQuery = jest.fn();
const mockGetUsersByDirektorat = jest.fn();
const mockGetPostsTodayByClient = jest.fn();
const mockGetCommentsByVideoId = jest.fn();
const mockSendDebug = jest.fn();

jest.unstable_mockModule('../src/db/index.js', () => ({ query: mockQuery }));
jest.unstable_mockModule('../src/model/userModel.js', () => ({
  getUsersByClient: jest.fn(),
  getUsersByDirektorat: mockGetUsersByDirektorat,
  getClientsByRole: jest.fn(),
}));
jest.unstable_mockModule('../src/model/tiktokPostModel.js', () => ({
  getPostsTodayByClient: mockGetPostsTodayByClient,
}));
jest.unstable_mockModule('../src/model/tiktokCommentModel.js', () => ({
  getCommentsByVideoId: mockGetCommentsByVideoId,
}));
jest.unstable_mockModule('../src/middleware/debugHandler.js', () => ({ sendDebug: mockSendDebug }));

let absensiKomentar;
beforeAll(async () => {
  ({ absensiKomentar } = await import('../src/handler/fetchabsensi/tiktok/absensiKomentarTiktok.js'));
});

beforeEach(() => {
  jest.clearAllMocks();
});

test('aggregates directorate data per client', async () => {
  mockQuery
    .mockResolvedValueOnce({ rows: [{ nama: 'DIT A', client_tiktok: '@dita', client_type: 'direktorat' }] })
    .mockResolvedValueOnce({ rows: [{ nama: 'POLRES A', client_tiktok: '@a', client_type: 'org' }] })
    .mockResolvedValueOnce({ rows: [{ nama: 'POLRES B', client_tiktok: '@b', client_type: 'org' }] });
  mockGetUsersByDirektorat.mockResolvedValueOnce([
    { user_id: 1, client_id: 'polres_a', tiktok: 'usera', status: true, exception: false },
    { user_id: 2, client_id: 'polres_b', tiktok: 'userb', status: true, exception: false },
  ]);
  mockGetPostsTodayByClient.mockResolvedValueOnce([{ video_id: 'v1' }]);
  mockGetCommentsByVideoId.mockResolvedValueOnce({ comments: [{ username: 'usera' }] });

  const msg = await absensiKomentar('ditbinmas', { roleFlag: 'ditbinmas' });

  expect(mockGetUsersByDirektorat).toHaveBeenCalledWith('ditbinmas', 'ditbinmas');

  expect(msg).toContain('POLRES A');
  expect(msg).toContain('✅ *Sudah melaksanakan* : *1 user*');
  expect(msg).toContain('⚠️ *Melaksanakan kurang lengkap* : *0 user*');
  expect(msg).toContain('POLRES B');
  expect(msg).toContain('❌ *Belum melaksanakan* : *1 user*');
  expect(msg).not.toMatch(/usera/i);
});
