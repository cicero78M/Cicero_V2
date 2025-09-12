import { jest } from '@jest/globals';

const mockQuery = jest.fn();
const mockGetPostsTodayByClient = jest.fn();
const mockGetCommentsByVideoId = jest.fn();
const mockGetUsersByDirektorat = jest.fn();
const mockGetClientsByRole = jest.fn();

jest.unstable_mockModule('../src/db/index.js', () => ({ query: mockQuery }));
jest.unstable_mockModule('../src/model/tiktokPostModel.js', () => ({ getPostsTodayByClient: mockGetPostsTodayByClient }));
jest.unstable_mockModule('../src/model/tiktokCommentModel.js', () => ({ getCommentsByVideoId: mockGetCommentsByVideoId }));
jest.unstable_mockModule('../src/model/userModel.js', async () => {
  const actual = await import('../src/model/userModel.js');
  return {
    ...actual,
    getUsersByDirektorat: mockGetUsersByDirektorat,
    getClientsByRole: mockGetClientsByRole,
  };
});

let absensiKomentarDitbinmasReport;

beforeAll(async () => {
  ({ absensiKomentarDitbinmasReport } = await import('../src/handler/fetchabsensi/tiktok/absensiKomentarTiktok.js'));
});

beforeEach(() => {
  mockQuery.mockReset();
  mockGetPostsTodayByClient.mockReset();
  mockGetCommentsByVideoId.mockReset();
  mockGetUsersByDirektorat.mockReset();
  mockGetClientsByRole.mockReset();
});

test('aggregates komentar report per satker with Direktorat Binmas on top', async () => {
  mockQuery
    .mockResolvedValueOnce({ rows: [{ nama: 'DIREKTORAT BINMAS', client_tiktok: 'ditbinmastiktok' }] })
    .mockResolvedValueOnce({ rows: [{ nama: 'DIREKTORAT BINMAS' }] })
    .mockResolvedValueOnce({ rows: [{ nama: 'POLRES A' }] });

  mockGetClientsByRole.mockResolvedValueOnce(['ditbinmas', 'polresa']);
  mockGetPostsTodayByClient.mockResolvedValueOnce([
    { video_id: 'vid1' },
    { video_id: 'vid2' },
    { video_id: 'vid3' },
  ]);
  mockGetCommentsByVideoId
    .mockResolvedValueOnce({ comments: [{ username: 'user1' }, { username: 'user4' }] })
    .mockResolvedValueOnce({ comments: [{ username: 'user1' }] })
    .mockResolvedValueOnce({ comments: [] });
  mockGetUsersByDirektorat.mockResolvedValueOnce([
    { user_id: 'u1', nama: 'User1', tiktok: 'user1', client_id: 'DITBINMAS', status: true },
    { user_id: 'u2', nama: 'User2', tiktok: '', client_id: 'DITBINMAS', status: true },
    { user_id: 'u3', nama: 'User3', tiktok: 'user3', client_id: 'POLRESA', status: true },
    { user_id: 'u4', nama: 'User4', tiktok: 'user4', client_id: 'POLRESA', status: true },
  ]);

  const msg = await absensiKomentarDitbinmasReport();

  expect(mockGetClientsByRole).toHaveBeenCalledWith('ditbinmas');
  expect(mockGetUsersByDirektorat).toHaveBeenCalledWith('ditbinmas', ['DITBINMAS', 'POLRESA']);
  expect(msg).toMatch(/Jumlah Total Personil : 4 pers/);
  expect(msg).toMatch(/✅ Sudah melaksanakan : 1 pers/);
  expect(msg).toMatch(/Melaksanakan kurang lengkap : 1 pers/);
  expect(msg).toMatch(/❌ Belum melaksanakan : 2 pers/);
  expect(msg).toMatch(/Belum Update Username TikTok : 1 pers/);
  expect(msg).toMatch(
    /1\. DIREKTORAT BINMAS\n\nJumlah Personil : 2 pers\nSudah melaksanakan : 1 pers\nMelaksanakan kurang lengkap : 0 pers\nBelum melaksanakan : 1 pers\nBelum Update Username TikTok : 1 pers/
  );
  expect(msg).toMatch(
    /2\. POLRES A\n\nJumlah Personil : 2 pers\nSudah melaksanakan : 0 pers\nMelaksanakan kurang lengkap : 1 pers\nBelum melaksanakan : 1 pers\nBelum Update Username TikTok : 0 pers/
  );
});
