import { jest } from '@jest/globals';

const mockQuery = jest.fn();

jest.unstable_mockModule('../src/repository/db.js', () => ({
  query: mockQuery,
}));

let getEvents;

beforeAll(async () => {
  const mod = await import('../src/model/editorialEventModel.js');
  getEvents = mod.getEvents;
});

beforeEach(() => {
  mockQuery.mockReset();
});

test('getEvents joins with penmas_user for username', async () => {
  mockQuery.mockResolvedValueOnce({ rows: [] });
  await getEvents('u1');
  expect(mockQuery).toHaveBeenCalledWith(
    expect.stringContaining('JOIN penmas_user'),
    ['u1']
  );
});
