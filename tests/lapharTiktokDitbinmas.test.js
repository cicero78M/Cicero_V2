import { jest } from '@jest/globals';

const mockQuery = jest.fn();
const mockGetPostsTodayByClient = jest.fn();
const mockGetCommentsByVideoId = jest.fn();
const mockGetUsersByDirektorat = jest.fn();
const mockGetClientsByRole = jest.fn();
const mockSendDebug = jest.fn();

jest.unstable_mockModule('../src/db/index.js', () => ({ query: mockQuery }));
jest.unstable_mockModule('../src/model/tiktokPostModel.js', () => ({
  getPostsTodayByClient: mockGetPostsTodayByClient,
  findPostByVideoId: jest.fn(),
  deletePostByVideoId: jest.fn(),
}));
jest.unstable_mockModule('../src/model/tiktokCommentModel.js', () => ({
  getCommentsByVideoId: mockGetCommentsByVideoId,
  deleteCommentsByVideoId: jest.fn(),
}));
jest.unstable_mockModule('../src/model/userModel.js', () => ({
  getClientsByRole: mockGetClientsByRole,
  getUsersByDirektorat: mockGetUsersByDirektorat,
  getUsersByClient: jest.fn(),
}));
jest.unstable_mockModule('../src/middleware/debugHandler.js', () => ({
  sendDebug: mockSendDebug,
}));

beforeEach(() => {
  jest.clearAllMocks();
});

test('builds analytical narrative with key metrics', async () => {
  mockGetPostsTodayByClient.mockResolvedValue([
    { video_id: 'v1', caption: 'Caption A unggulan' },
    { video_id: 'v2', caption: 'Caption B evaluasi' },
  ]);
  mockGetCommentsByVideoId
    .mockResolvedValueOnce({ comments: [{ username: 'dita1' }, { username: 'polresa1' }] })
    .mockResolvedValueOnce({ comments: [{ username: 'dita1' }] });
  mockGetClientsByRole.mockResolvedValue(['polres_a', 'polres_b']);
  mockGetUsersByDirektorat.mockResolvedValue([
    { user_id: '1', client_id: 'DITBINMAS', tiktok: 'dita1', insta: '@dita', status: true },
    { user_id: '2', client_id: 'POLRES_A', tiktok: 'polresa1', insta: '@polresa', status: true },
    { user_id: '3', client_id: 'POLRES_A', tiktok: '', insta: '@backup', status: true },
    { user_id: '4', client_id: 'POLRES_B', tiktok: 'polresb1', insta: '@polresb', status: true },
  ]);
  mockQuery.mockImplementation(async (_sql, params) => {
    const cid = (params[0] || '').toString().toUpperCase();
    const mapping = {
      DITBINMAS: { nama: 'Direktorat Binmas', client_tiktok: '@ditbinmas', client_type: 'direktorat' },
      POLRES_A: { nama: 'POLRES A', client_tiktok: '@polresa', client_type: 'org' },
      POLRES_B: { nama: 'POLRES B', client_tiktok: '@polresb', client_type: 'org' },
    };
    return { rows: [mapping[cid] || mapping.POLRES_A] };
  });

  let lapharTiktokDitbinmas;
  await jest.isolateModulesAsync(async () => {
    ({ lapharTiktokDitbinmas } = await import('../src/handler/fetchabsensi/tiktok/absensiKomentarTiktok.js'));
  });

  const result = await lapharTiktokDitbinmas();

  expect(result.narrative).toMatch(/📊 \*Ringkasan Analitik Komentar TikTok – DIREKTORAT BINMAS\*/);
  expect(result.narrative).toMatch(/• Konten dipantau : 2/);
  expect(result.narrative).toMatch(/• Interaksi aktual : 3\/8 \(37,5%\)/);
  expect(result.narrative).toMatch(/• Personel mencapai target : 1\/3 \(33,3%\)/);
  expect(result.narrative).toMatch(/• Personel aktif \(≥1 konten\) : 2\/3 \(66,7%\)/);
  expect(result.narrative).toMatch(/• Partisipan unik : 2 akun/);
  expect(result.narrative).toMatch(/• Performa tertinggi : Caption A unggulan – 2 akun/);
  expect(result.narrative).toMatch(/• Performa terendah : Caption B evaluasi – 1 akun/);
  expect(result.narrative).toMatch(/• Penyumbang komentar terbesar : POLRES A \(1\), POLRES B \(0\)/);
  expect(result.narrative).toMatch(/• Personel belum komentar : 1 \(prioritas: POLRES B \(1\)\)/);
  expect(result.narrative).toMatch(/• Belum input akun TikTok : 1 \(sumber utama: POLRES A \(1\)\)/);
  expect(result.text).toMatch(/Distribusi komentar per konten:/);
  expect(result.text).toMatch(/1\. https:\/\/www\.tiktok\.com\/\@ditbinmas\/video\/v1 — 2 akun/);
  expect(result.narrative).toMatch(/\*Distribusi Komentar per Konten\*/);
  expect(result.narrative).toMatch(/1\. https:\/\/www\.tiktok\.com\/\@ditbinmas\/video\/v1 — 2 akun/);
  expect(result.narrative).toMatch(/Demikian Komandan, terimakasih\./);
});

afterAll(() => {
  jest.resetModules();
});
