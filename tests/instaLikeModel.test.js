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

test('date range uses between filter', async () => {
  mockQuery.mockResolvedValueOnce({ rows: [{ jumlah_post: '0' }] });
  mockQuery.mockResolvedValueOnce({ rows: [] });
  await getRekapLikesByClient('1', 'harian', undefined, '2023-10-01', '2023-10-07');
  const expected = "(created_at AT TIME ZONE 'Asia/Jakarta')::date BETWEEN $2::date AND $3::date";
  expect(mockQuery).toHaveBeenNthCalledWith(
    1,
    expect.stringContaining(expected),
    ['1', '2023-10-01', '2023-10-07']
  );
  expect(mockQuery).toHaveBeenNthCalledWith(
    2,
    expect.stringContaining(expected),
    ['1', '2023-10-01', '2023-10-07']
  );
});

test('query normalizes instagram usernames', async () => {
  mockQuery.mockResolvedValueOnce({ rows: [{ jumlah_post: '0' }] });
  mockQuery.mockResolvedValueOnce({ rows: [] });
  await getRekapLikesByClient('1');
  expect(mockQuery).toHaveBeenNthCalledWith(
    2,
    expect.stringContaining('jsonb_array_elements(l.likes)'),
    ['1']
  );
});

test('marks sudahMelaksanakan when reaching 20% threshold', async () => {
  mockQuery
    .mockResolvedValueOnce({ rows: [{ jumlah_post: '5' }] })
    .mockResolvedValueOnce({
      rows: [
        {
          user_id: 'u1',
          title: 'Aiptu',
          nama: 'Budi',
          username: 'budi',
          divisi: 'BAG',
          exception: false,
          jumlah_like: 1,
        },
      ],
    });
  const rows = await getRekapLikesByClient('POLRES');
  expect(rows[0].sudahMelaksanakan).toBe(true);
});

test('marks belum when below 20% threshold', async () => {
  mockQuery
    .mockResolvedValueOnce({ rows: [{ jumlah_post: '10' }] })
    .mockResolvedValueOnce({
      rows: [
        {
          user_id: 'u1',
          title: 'Aiptu',
          nama: 'Budi',
          username: 'budi',
          divisi: 'BAG',
          exception: false,
          jumlah_like: 1,
        },
      ],
    });
  const rows = await getRekapLikesByClient('POLRES');
  expect(rows[0].sudahMelaksanakan).toBe(false);
});
