import { jest } from '@jest/globals';

const mockGetShortcodesTodayByClient = jest.fn();
const mockGetLikesByShortcode = jest.fn();
const mockGetTiktokPostsToday = jest.fn();
const mockGetCommentsByVideoId = jest.fn();
const mockFindClientById = jest.fn();
const mockHandleFetchLikesInstagram = jest.fn();
const mockHandleFetchKomentarTiktokBatch = jest.fn();

jest.unstable_mockModule('../src/model/instaPostModel.js', () => ({
  getShortcodesTodayByClient: mockGetShortcodesTodayByClient,
}));
jest.unstable_mockModule('../src/model/instaLikeModel.js', () => ({
  getLikesByShortcode: mockGetLikesByShortcode,
}));
jest.unstable_mockModule('../src/model/tiktokPostModel.js', () => ({
  getPostsTodayByClient: mockGetTiktokPostsToday,
}));
jest.unstable_mockModule('../src/model/tiktokCommentModel.js', () => ({
  getCommentsByVideoId: mockGetCommentsByVideoId,
}));
jest.unstable_mockModule('../src/service/clientService.js', () => ({
  findClientById: mockFindClientById,
}));
jest.unstable_mockModule('../src/handler/fetchengagement/fetchLikesInstagram.js', () => ({
  handleFetchLikesInstagram: mockHandleFetchLikesInstagram,
}));
jest.unstable_mockModule('../src/handler/fetchengagement/fetchCommentTiktok.js', () => ({
  handleFetchKomentarTiktokBatch: mockHandleFetchKomentarTiktokBatch,
}));

let generateSosmedTaskMessage;
beforeAll(async () => {
  ({ generateSosmedTaskMessage } = await import('../src/handler/fetchabsensi/sosmedTask.js'));
});

beforeEach(() => {
  jest.clearAllMocks();
});

test('generateSosmedTaskMessage formats message correctly', async () => {
  mockFindClientById.mockResolvedValue({ nama: 'Dit Binmas', client_tiktok: '' });
  mockGetShortcodesTodayByClient.mockResolvedValue(['abc']);
  mockGetLikesByShortcode.mockResolvedValue([{}, {}]);
  mockGetTiktokPostsToday.mockResolvedValue([{ video_id: '123' }]);
  mockGetCommentsByVideoId.mockResolvedValue({ comments: [{}] });
  mockHandleFetchLikesInstagram.mockResolvedValue();
  mockHandleFetchKomentarTiktokBatch.mockResolvedValue();

  const msg = await generateSosmedTaskMessage();

  expect(mockFindClientById).toHaveBeenCalledWith('DITBINMAS');
  expect(msg).toContain('Total likes semua konten: 2');
  expect(msg).toContain('Total komentar semua konten: 1');
  expect(msg).toContain('https://www.tiktok.com/video/123');
  expect(msg).toContain('2 likes');
  expect(mockHandleFetchLikesInstagram).toHaveBeenCalledWith(null, null, 'DITBINMAS');
  expect(mockHandleFetchKomentarTiktokBatch).toHaveBeenCalledWith(null, null, 'DITBINMAS');
});

test('generateSosmedTaskMessage can skip tiktok fetch', async () => {
  mockFindClientById.mockResolvedValue({ nama: 'Dit Binmas', client_tiktok: '' });
  mockGetShortcodesTodayByClient.mockResolvedValue([]);
  mockGetTiktokPostsToday.mockResolvedValue([]);
  mockHandleFetchLikesInstagram.mockResolvedValue();

  await generateSosmedTaskMessage('DITBINMAS', true);

  expect(mockHandleFetchKomentarTiktokBatch).not.toHaveBeenCalled();
});
