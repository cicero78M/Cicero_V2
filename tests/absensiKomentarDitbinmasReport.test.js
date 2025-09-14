import { jest } from '@jest/globals';

const mockQuery = jest.fn();
const mockGetPostsTodayByClient = jest.fn();
const mockGetCommentsByVideoId = jest.fn();
const mockGetUsersByDirektorat = jest.fn();

jest.unstable_mockModule('../src/db/index.js', () => ({ query: mockQuery }));
jest.unstable_mockModule('../src/model/tiktokPostModel.js', () => ({ getPostsTodayByClient: mockGetPostsTodayByClient }));
jest.unstable_mockModule('../src/model/tiktokCommentModel.js', () => ({ getCommentsByVideoId: mockGetCommentsByVideoId }));
jest.unstable_mockModule('../src/model/userModel.js', async () => {
  const actual = await import('../src/model/userModel.js');
  return {
    ...actual,
    getUsersByDirektorat: mockGetUsersByDirektorat,
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
});

test('aggregates komentar report per division for Ditbinmas', async () => {
  mockQuery.mockResolvedValueOnce({ rows: [{ nama: 'DIREKTORAT BINMAS', client_tiktok: 'ditbinmastiktok' }] });

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
    { user_id: 'u1', nama: 'User1', tiktok: 'user1', divisi: 'DIV A', client_id: 'DITBINMAS', status: true },
    { user_id: 'u2', nama: 'User2', tiktok: '', divisi: 'DIV A', client_id: 'DITBINMAS', status: true },
    { user_id: 'u3', nama: 'User3', tiktok: 'user3', divisi: 'DIV B', client_id: 'DITBINMAS', status: true },
    { user_id: 'u4', nama: 'User4', tiktok: 'user4', divisi: 'DIV B', client_id: 'DITBINMAS', status: true },
  ]);

  const msg = await absensiKomentarDitbinmasReport();

  expect(mockGetUsersByDirektorat).toHaveBeenCalledWith('ditbinmas', 'DITBINMAS');
  expect(msg).toContain('*Jumlah Total Personil:* 4 pers');
  expect(msg).toContain('✅ *Sudah melaksanakan* : *1 pers*');
  expect(msg).toContain('⚠️ *Melaksanakan kurang lengkap* : *1 pers*');
  expect(msg).toContain('❌ *Belum melaksanakan* : *2 pers*');
  expect(msg).toContain('⚠️ *Belum Update Username TikTok* : *1 pers*');
  const expectedDivA =
    "1. DIV A\n\n" +
    "*Jumlah Personil* : 2 pers\n" +
    "✅ *Sudah melaksanakan* : 1 pers\n" +
    "⚠️ *Melaksanakan kurang lengkap* : 0 pers\n" +
    "❌ *Belum melaksanakan* : 1 pers\n" +
    "⚠️ *Belum Update Username TikTok* : 1 pers";
  expect(msg).toContain(expectedDivA);
  const expectedDivB =
    "2. DIV B\n\n" +
    "*Jumlah Personil* : 2 pers\n" +
    "✅ *Sudah melaksanakan* : 0 pers\n" +
    "⚠️ *Melaksanakan kurang lengkap* : 1 pers\n" +
    "❌ *Belum melaksanakan* : 1 pers\n" +
    "⚠️ *Belum Update Username TikTok* : 0 pers";
  expect(msg).toContain(expectedDivB);
});
