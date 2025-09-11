import { jest } from '@jest/globals';

const mockQuery = jest.fn();
const mockGetUsersByClient = jest.fn();
const mockGetUsersByDirektorat = jest.fn();
const mockGetPostsTodayByClient = jest.fn();
const mockGetCommentsByVideoId = jest.fn();
const mockSendDebug = jest.fn();

jest.unstable_mockModule('../src/db/index.js', () => ({ query: mockQuery }));
jest.unstable_mockModule('../src/model/userModel.js', () => ({
  getUsersByClient: mockGetUsersByClient,
  getUsersByDirektorat: mockGetUsersByDirektorat,
  getClientsByRole: jest.fn(),
}));
jest.unstable_mockModule('../src/model/tiktokPostModel.js', () => ({
  getPostsTodayByClient: mockGetPostsTodayByClient,
}));
jest.unstable_mockModule('../src/model/tiktokCommentModel.js', () => ({
  getCommentsByVideoId: mockGetCommentsByVideoId,
}));
jest.unstable_mockModule('../src/middleware/debugHandler.js', () => ({
  sendDebug: mockSendDebug,
}));

let absensiKomentar;

beforeAll(async () => {
  ({ absensiKomentar } = await import('../src/handler/fetchabsensi/tiktok/absensiKomentarTiktok.js'));
});

beforeEach(() => {
  jest.clearAllMocks();
});

test('filters users by roleFlag when provided', async () => {
  mockQuery.mockResolvedValueOnce({ rows: [{ nama: 'POLRES ABC', client_tiktok: '@abc', client_type: 'org' }] });
  mockGetUsersByClient.mockResolvedValueOnce([]);
  mockGetPostsTodayByClient.mockResolvedValueOnce([]);

  await absensiKomentar('POLRES', { roleFlag: 'ditbinmas' });

  expect(mockGetUsersByClient).toHaveBeenCalledWith('POLRES', 'ditbinmas');
  expect(mockGetUsersByDirektorat).not.toHaveBeenCalled();
});
