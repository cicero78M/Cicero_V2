import { jest } from '@jest/globals';

const mockGetRekap = jest.fn();
jest.unstable_mockModule('../src/model/tiktokCommentModel.js', () => ({
  getRekapKomentarByClient: mockGetRekap
}));
jest.unstable_mockModule('../src/service/tiktokCommentService.js', () => ({}));
jest.unstable_mockModule('../src/service/tiktokPostService.js', () => ({}));
jest.unstable_mockModule('../src/service/clientService.js', () => ({}));
jest.unstable_mockModule('../src/utils/response.js', () => ({ sendSuccess: jest.fn() }));
jest.unstable_mockModule('../src/service/tiktokApi.js', () => ({
  fetchTiktokProfile: jest.fn(),
  fetchTiktokPosts: jest.fn(),
  fetchTiktokPostsBySecUid: jest.fn(),
  fetchTiktokInfo: jest.fn(),
}));
jest.unstable_mockModule('../src/service/profileCacheService.js', () => ({}));

let getTiktokRekapKomentar;
beforeAll(async () => {
  ({ getTiktokRekapKomentar } = await import('../src/controller/tiktokController.js'));
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
  const res = { json, status: jest.fn().mockReturnThis() };
  await getTiktokRekapKomentar(req, res);
  expect(mockGetRekap).toHaveBeenCalledWith('c1', 'harian', undefined, '2024-01-01', '2024-01-31');
  expect(json).toHaveBeenCalledWith(expect.objectContaining({ chartHeight: 300 }));
});

