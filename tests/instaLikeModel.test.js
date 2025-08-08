import { jest } from '@jest/globals';

const mockQuery = jest.fn();

jest.unstable_mockModule('../src/repository/db.js', () => ({
  query: mockQuery,
}));

let getRekapLikesByClient;

beforeAll(async () => {
  ({ getRekapLikesByClient } = await import('../src/model/instaLikeModel.js'));
});

beforeEach(() => {
  mockQuery.mockReset();
});

test('harian with specific date uses date filter', async () => {
  mockQuery.mockResolvedValueOnce({ rows: [{ jumlah_post: '0' }] });
  mockQuery.mockResolvedValueOnce({ rows: [] });
  await getRekapLikesByClient('1', 'harian', '2023-10-05');
  expect(mockQuery).toHaveBeenNthCalledWith(
    1,
    expect.stringContaining('created_at::date = $2::date'),
    ['1', '2023-10-05']
  );
  expect(mockQuery).toHaveBeenNthCalledWith(
    2,
    expect.stringContaining('created_at::date = $2::date'),
    ['1', '2023-10-05']
  );
});

test('mingguan with date truncs week', async () => {
  mockQuery.mockResolvedValueOnce({ rows: [{ jumlah_post: '0' }] });
  mockQuery.mockResolvedValueOnce({ rows: [] });
  await getRekapLikesByClient('1', 'mingguan', '2023-10-05');
  const expected = "date_trunc('week', created_at) = date_trunc('week', $2::date)";
  expect(mockQuery).toHaveBeenNthCalledWith(1, expect.stringContaining(expected), ['1', '2023-10-05']);
  expect(mockQuery).toHaveBeenNthCalledWith(2, expect.stringContaining(expected), ['1', '2023-10-05']);
});

test('bulanan converts month string', async () => {
  mockQuery.mockResolvedValueOnce({ rows: [{ jumlah_post: '0' }] });
  mockQuery.mockResolvedValueOnce({ rows: [] });
  await getRekapLikesByClient('1', 'bulanan', '2023-10');
  const expected = "date_trunc('month', created_at AT TIME ZONE 'Asia/Jakarta') = date_trunc('month', $2::date)";
  expect(mockQuery).toHaveBeenNthCalledWith(1, expect.stringContaining(expected), ['1', '2023-10-01']);
  expect(mockQuery).toHaveBeenNthCalledWith(2, expect.stringContaining(expected), ['1', '2023-10-01']);
});

test('semua uses no date filter', async () => {
  mockQuery.mockResolvedValueOnce({ rows: [{ jumlah_post: '0' }] });
  mockQuery.mockResolvedValueOnce({ rows: [] });
  await getRekapLikesByClient('1', 'semua');
  expect(mockQuery).toHaveBeenNthCalledWith(1, expect.stringContaining('1=1'), ['1']);
  expect(mockQuery).toHaveBeenNthCalledWith(2, expect.stringContaining('1=1'), ['1']);
});
