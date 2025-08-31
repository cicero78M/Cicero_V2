import { jest } from '@jest/globals';

const mockGetRekap = jest.fn();
jest.unstable_mockModule('../src/model/instaLikeModel.js', () => ({
  getRekapLikesByClient: mockGetRekap
}));
jest.unstable_mockModule('../src/middleware/debugHandler.js', () => ({
  sendConsoleDebug: jest.fn()
}));

let getDitbinmasLikes;
beforeAll(async () => {
  ({ getDitbinmasLikes } = await import('../src/controller/likesController.js'));
});

beforeEach(() => {
  mockGetRekap.mockReset();
});

test('returns ditbinmas like summaries', async () => {
  const rows = [
    { username: 'alice', jumlah_like: 4 },
    { username: 'bob', jumlah_like: 1 },
    { username: 'charlie', jumlah_like: 0 },
    { username: null, jumlah_like: 0 }
  ];
  mockGetRekap.mockResolvedValue({ rows, totalKonten: 4 });
  const req = { query: {} };
  const json = jest.fn();
  const res = { json, status: jest.fn().mockReturnThis() };
  await getDitbinmasLikes(req, res);
  expect(mockGetRekap).toHaveBeenCalledWith('ditbinmas', 'harian', undefined, undefined, undefined, 'ditbinmas');
  expect(json).toHaveBeenCalledWith(
    expect.objectContaining({
      sudahUsers: ['alice'],
      kurangUsers: ['bob'],
      belumUsers: ['charlie'],
      sudahUsersCount: 1,
      kurangUsersCount: 1,
      belumUsersCount: 2,
      noUsernameUsersCount: 1,
      usersCount: 4
    })
  );
});
