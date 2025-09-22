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

  const { text, igCount, tiktokCount } = await generateSosmedTaskMessage();

  expect(mockFindClientById).toHaveBeenCalledWith('DITBINMAS');
  expect(text).toContain('Total likes semua konten: 2');
  expect(text).toContain('Total komentar semua konten: 1');
  expect(text).toContain('https://www.tiktok.com/video/123');
  expect(text).toContain('2 likes');
  expect(igCount).toBe(1);
  expect(tiktokCount).toBe(1);
  expect(mockHandleFetchLikesInstagram).toHaveBeenCalledWith(null, null, 'DITBINMAS');
  expect(mockHandleFetchKomentarTiktokBatch).toHaveBeenCalledWith(null, null, 'DITBINMAS');
});

test('generateSosmedTaskMessage can skip internal fetches', async () => {
  mockFindClientById.mockResolvedValue({ nama: 'Dit Binmas', client_tiktok: '' });
  mockGetShortcodesTodayByClient.mockResolvedValue([]);
  mockGetTiktokPostsToday.mockResolvedValue([]);
  mockHandleFetchLikesInstagram.mockResolvedValue();

  await generateSosmedTaskMessage('DITBINMAS', {
    skipTiktokFetch: true,
    skipLikesFetch: true,
  });

  expect(mockGetShortcodesTodayByClient).toHaveBeenCalledWith('DITBINMAS');
  expect(mockGetTiktokPostsToday).toHaveBeenCalledWith('DITBINMAS');
  expect(mockHandleFetchKomentarTiktokBatch).not.toHaveBeenCalled();
  expect(mockHandleFetchLikesInstagram).not.toHaveBeenCalled();
});

test('generateSosmedTaskMessage preserves ordering from sources', async () => {
  mockFindClientById.mockResolvedValue({ nama: 'Unit', client_tiktok: '@operator' });
  mockGetShortcodesTodayByClient.mockResolvedValue(['latest', 'earlier']);
  mockGetLikesByShortcode
    .mockResolvedValueOnce([{}])
    .mockResolvedValueOnce([{}, {}]);
  mockGetTiktokPostsToday.mockResolvedValue([
    { video_id: 'vid-b' },
    { video_id: 'vid-a' },
  ]);
  mockGetCommentsByVideoId
    .mockResolvedValueOnce({ comments: [{}, {}] })
    .mockResolvedValueOnce({ comments: [{}] });

  const { text } = await generateSosmedTaskMessage('CLIENT', {
    skipLikesFetch: true,
    skipTiktokFetch: true,
  });

  const igFirst = text.indexOf('https://www.instagram.com/p/latest');
  const igSecond = text.indexOf('https://www.instagram.com/p/earlier');
  expect(igFirst).toBeGreaterThan(-1);
  expect(igSecond).toBeGreaterThan(-1);
  expect(igFirst).toBeLessThan(igSecond);

  const ttFirst = text.indexOf('/@operator/video/vid-b');
  const ttSecond = text.indexOf('/@operator/video/vid-a');
  expect(ttFirst).toBeGreaterThan(-1);
  expect(ttSecond).toBeGreaterThan(-1);
  expect(ttFirst).toBeLessThan(ttSecond);
});
