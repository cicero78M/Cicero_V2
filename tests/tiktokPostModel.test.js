import { jest } from '@jest/globals';

const mockQuery = jest.fn();

jest.unstable_mockModule('../src/repository/db.js', () => ({
  query: mockQuery,
}));

let getPostsTodayByClient;

beforeAll(async () => {
  ({ getPostsTodayByClient } = await import('../src/model/tiktokPostModel.js'));
});

beforeEach(() => {
  mockQuery.mockReset();
});

test('getPostsTodayByClient orders posts by created_at and video_id', async () => {
  mockQuery.mockResolvedValueOnce({ rows: [] });

  await getPostsTodayByClient('Client 1');

  expect(mockQuery).toHaveBeenCalledWith(
    expect.stringMatching(/ORDER BY\s+created_at\s+ASC,\s+video_id\s+ASC/i),
    ['client 1']
  );
});

