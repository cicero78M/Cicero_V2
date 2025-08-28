import { jest } from '@jest/globals';

const mockQuery = jest.fn();
const mockGetUsersByClient = jest.fn();
const mockGetUsersByDirektorat = jest.fn();
const mockGetShortcodesTodayByClient = jest.fn();
const mockGetLikesByShortcode = jest.fn();
const mockGetClientsByRole = jest.fn();

jest.unstable_mockModule('../src/db/index.js', () => ({ query: mockQuery }));
jest.unstable_mockModule('../src/model/userModel.js', () => ({
  getUsersByClient: mockGetUsersByClient,
  getUsersByDirektorat: mockGetUsersByDirektorat,
  getClientsByRole: mockGetClientsByRole,
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
  mockGetClientsByRole.mockReset();
});

test('marks user with @username as already liking', async () => {
  mockQuery.mockResolvedValueOnce({ rows: [{ nama: 'POLRES ABC', client_type: 'instansi' }] });
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

test('uses directorate users when roleFlag matches directorate', async () => {
  mockQuery.mockResolvedValueOnce({ rows: [{ nama: 'DITBINMAS', client_type: 'direktorat' }] });
  mockGetClientsByRole.mockResolvedValueOnce([]);
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

  const msg = await absensiLikes('DITBINMAS', {
    mode: 'sudah',
    roleFlag: 'DITBINMAS',
  });

  expect(mockGetUsersByDirektorat).toHaveBeenCalled();
  expect(mockGetUsersByClient).not.toHaveBeenCalled();
});

test('filters users by role when roleFlag provided for polres', async () => {
  mockQuery.mockResolvedValueOnce({ rows: [{ nama: 'POLRES ABC', client_type: 'instansi' }] });
  mockGetUsersByClient.mockResolvedValueOnce([]);
  mockGetShortcodesTodayByClient.mockResolvedValueOnce([]);

  await absensiLikes('POLRES', { roleFlag: 'ditbinmas' });

  expect(mockGetUsersByClient).toHaveBeenCalledWith('POLRES', 'ditbinmas');
});

test('directorate summarizes across clients', async () => {
  mockQuery
    .mockResolvedValueOnce({ rows: [{ nama: 'Ditbinmas', client_type: 'direktorat' }] })
    .mockResolvedValueOnce({ rows: [{ nama: 'POLRES A' }] })
    .mockResolvedValueOnce({ rows: [{ nama: 'POLRES B' }] });
  mockGetClientsByRole.mockResolvedValueOnce(['polresa', 'polresb']);
  mockGetShortcodesTodayByClient.mockResolvedValueOnce(['sc1', 'sc2', 'sc3']);
  mockGetLikesByShortcode
    .mockResolvedValueOnce(['user1', 'user3'])
    .mockResolvedValueOnce(['user3'])
    .mockResolvedValueOnce([]);
  mockGetUsersByDirektorat.mockResolvedValueOnce([
    {
      user_id: 'u1',
      nama: 'User1',
      insta: '@user1',
      client_id: 'POLRESA',
      exception: false,
      status: true,
    },
    {
      user_id: 'u2',
      nama: 'User2',
      insta: '',
      client_id: 'POLRESA',
      exception: false,
      status: true,
    },
    {
      user_id: 'u3',
      nama: 'User3',
      insta: '@user3',
      client_id: 'POLRESB',
      exception: false,
      status: true,
    },
    {
      user_id: 'u4',
      nama: 'User4',
      insta: '@user4',
      client_id: 'POLRESB',
      exception: false,
      status: true,
    },
  ]);

  const msg = await absensiLikes('DITBINMAS');

  expect(mockGetClientsByRole).toHaveBeenCalledWith('ditbinmas');
  expect(mockGetShortcodesTodayByClient).toHaveBeenCalledWith('ditbinmas');
  expect(mockGetUsersByDirektorat).toHaveBeenCalledWith('ditbinmas', [
    'POLRESA',
    'POLRESB',
  ]);
  expect(msg).toMatch(/Client\*: \*POLRES A\*[\s\S]*Sudah melaksanakan\* : \*0 user\*[\s\S]*Kurang melaksanakan\* : \*1 user\*[\s\S]*Belum melaksanakan\* : \*0 user\*[\s\S]*Tanpa username\* : \*1 user/);
  expect(msg).toMatch(/Client\*: \*POLRES B\*[\s\S]*Sudah melaksanakan\* : \*1 user\*[\s\S]*Kurang melaksanakan\* : \*0 user\*[\s\S]*Belum melaksanakan\* : \*1 user\*[\s\S]*Tanpa username\* : \*0 user/);
});

