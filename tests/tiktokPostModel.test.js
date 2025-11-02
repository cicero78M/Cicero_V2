import { jest } from '@jest/globals';

const mockQuery = jest.fn();

jest.unstable_mockModule('../src/repository/db.js', () => ({
  query: mockQuery,
}));

let getPostsTodayByClient;
let countPostsByClient;

beforeAll(async () => {
  ({ getPostsTodayByClient, countPostsByClient } = await import('../src/model/tiktokPostModel.js'));
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

test('countPostsByClient restricts directorate totals to ditbinmas posts and users', async () => {
  mockQuery.mockResolvedValueOnce({ rows: [{ client_type: 'direktorat' }] });
  mockQuery.mockResolvedValueOnce({ rows: [{ jumlah_post: '3' }] });

  const total = await countPostsByClient('ditsamapta', 'harian', undefined, undefined, undefined, 'ditsamapta');

  expect(total).toBe(3);
  expect(mockQuery.mock.calls[0][0]).toContain('LOWER(TRIM(client_id)) = $1');
  expect(mockQuery.mock.calls[0][1]).toEqual(['ditsamapta']);
  const sql = mockQuery.mock.calls[1][0];
  expect(sql).toContain('LOWER(TRIM(p.client_id)) = $1');
  expect(sql).toContain('LOWER(TRIM(r.role_name)) = $2');
  expect(mockQuery.mock.calls[1][1]).toEqual(['ditbinmas', 'ditbinmas']);
});

