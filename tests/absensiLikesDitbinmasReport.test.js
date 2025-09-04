import { jest } from '@jest/globals';

const mockQuery = jest.fn();
const mockGetUsersByDirektorat = jest.fn();
const mockGetUsersByClient = jest.fn();
const mockGetClientsByRole = jest.fn();
const mockGetShortcodesTodayByClient = jest.fn();
const mockGetLikesByShortcode = jest.fn();

jest.unstable_mockModule('../src/db/index.js', () => ({ query: mockQuery }));
jest.unstable_mockModule('../src/model/userModel.js', () => ({
  getUsersByDirektorat: mockGetUsersByDirektorat,
  getUsersByClient: mockGetUsersByClient,
  getClientsByRole: mockGetClientsByRole,
}));
jest.unstable_mockModule('../src/model/instaPostModel.js', () => ({
  getShortcodesTodayByClient: mockGetShortcodesTodayByClient,
}));
jest.unstable_mockModule('../src/model/instaLikeModel.js', () => ({
  getLikesByShortcode: mockGetLikesByShortcode,
}));

let absensiLikesDitbinmasReport;
beforeAll(async () => {
  ({ absensiLikesDitbinmasReport } = await import('../src/handler/fetchabsensi/insta/absensiLikesInsta.js'));
});

beforeEach(() => {
  jest.clearAllMocks();
});

test('absensiLikesDitbinmasReport filters users to ditbinmas client', async () => {
  mockGetShortcodesTodayByClient.mockResolvedValue(['sc1']);
  mockGetLikesByShortcode.mockResolvedValue([]);
  mockGetUsersByDirektorat.mockResolvedValue([
    { status: true, insta: '@user1', title: 'AKBP', nama: 'User One' },
  ]);

  await absensiLikesDitbinmasReport();

  expect(mockGetUsersByDirektorat).toHaveBeenCalledWith('ditbinmas', 'DITBINMAS');
});
