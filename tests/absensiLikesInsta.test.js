import { jest } from '@jest/globals';

const mockQuery = jest.fn();
const mockGetUsersByClient = jest.fn();
const mockGetUsersByDirektorat = jest.fn();
const mockGetShortcodesTodayByClient = jest.fn();
const mockGetLikesByShortcode = jest.fn();

jest.unstable_mockModule('../src/db/index.js', () => ({ query: mockQuery }));
jest.unstable_mockModule('../src/model/userModel.js', () => ({
  getUsersByClient: mockGetUsersByClient,
  getUsersByDirektorat: mockGetUsersByDirektorat,
}));
jest.unstable_mockModule('../src/model/instaPostModel.js', () => ({ getShortcodesTodayByClient: mockGetShortcodesTodayByClient }));
jest.unstable_mockModule('../src/model/instaLikeModel.js', () => ({ getLikesByShortcode: mockGetLikesByShortcode }));

let absensiLikes;

beforeAll(async () => {
  ({ absensiLikes } = await import('../src/handler/fetchabsensi/insta/absensiLikesInsta.js'));
});

beforeEach(() => {
  mockQuery.mockReset();
  mockGetUsersByClient.mockReset();
  mockGetUsersByDirektorat.mockReset();
  mockGetShortcodesTodayByClient.mockReset();
  mockGetLikesByShortcode.mockReset();
});

test('marks user with @username as already liking', async () => {
  mockQuery.mockResolvedValueOnce({ rows: [{ nama: 'POLRES ABC' }] });
  mockGetUsersByClient.mockResolvedValueOnce([
    {
      user_id: 'u1',
      title: 'Aiptu',
      nama: 'Budi',
      insta: '@TestUser',
      divisi: 'BAG',
      exception: false,
    },
  ]);
  mockGetShortcodesTodayByClient.mockResolvedValueOnce(['sc1']);
  mockGetLikesByShortcode.mockResolvedValueOnce(['testuser']);

  const msg = await absensiLikes('POLRES', { mode: 'sudah' });

  expect(msg).toMatch(/Sudah melaksanakan\* : \*1 user\*/);
  expect(msg).toMatch(/Belum melaksanakan\* : \*0 user\*/);
});

test('uses role-based users when roleFlag matches client', async () => {
  mockQuery.mockResolvedValueOnce({ rows: [{ nama: 'POLRES ABC' }] });
  mockGetUsersByDirektorat.mockResolvedValueOnce([
    {
      user_id: 'u1',
      title: 'Aiptu',
      nama: 'Budi',
      insta: '@TestUser',
      divisi: 'BAG',
      exception: false,
      status: true,
    },
  ]);
  mockGetShortcodesTodayByClient.mockResolvedValueOnce(['sc1']);
  mockGetLikesByShortcode.mockResolvedValueOnce(['testuser']);

  const msg = await absensiLikes('POLRES', {
    mode: 'sudah',
    roleFlag: 'POLRES',
  });

  expect(mockGetUsersByDirektorat).toHaveBeenCalled();
  expect(mockGetUsersByClient).not.toHaveBeenCalled();
  expect(msg).toMatch(/Sudah melaksanakan\* : \*1 user\*/);
});

