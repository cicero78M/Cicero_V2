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
  mockQuery.mockResolvedValueOnce({ rows: [] });
  mockQuery.mockResolvedValueOnce({ rows: [{ total_post: 0 }] });
  await getRekapLikesByClient('1', 'harian', '2023-10-05');
  const expected = "p.created_at::date = $2::date";
  expect(mockQuery).toHaveBeenNthCalledWith(1, expect.stringContaining(expected), ['1', '2023-10-05']);
});

test('mingguan with date truncs week', async () => {
  mockQuery.mockResolvedValueOnce({ rows: [] });
  mockQuery.mockResolvedValueOnce({ rows: [{ total_post: 0 }] });
  await getRekapLikesByClient('1', 'mingguan', '2023-10-05');
  const expected = "date_trunc('week', p.created_at) = date_trunc('week', $2::date)";
  expect(mockQuery).toHaveBeenNthCalledWith(1, expect.stringContaining(expected), ['1', '2023-10-05']);
});

test('bulanan converts month string', async () => {
  mockQuery.mockResolvedValueOnce({ rows: [] });
  mockQuery.mockResolvedValueOnce({ rows: [{ total_post: 0 }] });
  await getRekapLikesByClient('1', 'bulanan', '2023-10');
  const expected = "date_trunc('month', p.created_at AT TIME ZONE 'Asia/Jakarta') = date_trunc('month', $2::date)";
  expect(mockQuery).toHaveBeenNthCalledWith(1, expect.stringContaining(expected), ['1', '2023-10-01']);
});

test('semua uses no date filter', async () => {
  mockQuery.mockResolvedValueOnce({ rows: [] });
  mockQuery.mockResolvedValueOnce({ rows: [{ total_post: 0 }] });
  await getRekapLikesByClient('1', 'semua');
  expect(mockQuery).toHaveBeenNthCalledWith(1, expect.stringContaining('1=1'), ['1']);
});

test('date range uses between filter', async () => {
  mockQuery.mockResolvedValueOnce({ rows: [] });
  mockQuery.mockResolvedValueOnce({ rows: [{ total_post: 0 }] });
  await getRekapLikesByClient('1', 'harian', undefined, '2023-10-01', '2023-10-07');
  const expected = "(p.created_at AT TIME ZONE 'Asia/Jakarta')::date BETWEEN $2::date AND $3::date";
  expect(mockQuery).toHaveBeenNthCalledWith(1, expect.stringContaining(expected), ['1', '2023-10-01', '2023-10-07']);
});

test('query normalizes instagram usernames', async () => {
  mockQuery.mockResolvedValueOnce({ rows: [] });
  mockQuery.mockResolvedValueOnce({ rows: [{ total_post: 0 }] });
  await getRekapLikesByClient('1');
  expect(mockQuery).toHaveBeenNthCalledWith(1, expect.stringContaining('jsonb_array_elements(l.likes)'), ['1']);
});

test('parses jumlah_like as integer', async () => {
  mockQuery.mockResolvedValueOnce({
    rows: [{
      user_id: 'u1',
      title: 'Aiptu',
      nama: 'Budi',
      username: 'budi',
      divisi: 'BAG',
      exception: false,
      jumlah_like: '3',
    }],
  });
  mockQuery.mockResolvedValueOnce({ rows: [{ total_post: 0 }] });
  const { rows } = await getRekapLikesByClient('1');
  expect(rows[0].jumlah_like).toBe(3);
});

test('filters users by role when role is ditbinmas', async () => {
  mockQuery.mockResolvedValueOnce({ rows: [] });
  mockQuery.mockResolvedValueOnce({ rows: [{ total_post: 0 }] });
  await getRekapLikesByClient('c1', 'harian', undefined, undefined, undefined, 'ditbinmas');
  const sql = mockQuery.mock.calls[0][0];
  const params = mockQuery.mock.calls[0][1];
  expect(sql).toContain('user_roles ur');
  expect(sql).toContain('roles r');
  expect(sql).toContain('LOWER(r.role_name) = LOWER($2)');
  expect(sql).toContain('1=1');
  expect(sql).not.toContain('insta_post_roles');
  expect(sql).not.toContain('LOWER(u.client_id) = LOWER($1)');
  expect(sql).not.toContain('LOWER(p.client_id) = LOWER($1)');
  expect(params).toEqual(['DITBINMAS', 'ditbinmas']);
});

test('ignores non-ditbinmas roles', async () => {
  mockQuery.mockResolvedValueOnce({ rows: [] });
  mockQuery.mockResolvedValueOnce({ rows: [{ total_post: 0 }] });
  await getRekapLikesByClient('c1', 'harian', undefined, undefined, undefined, 'ditintelkam');
  const sql = mockQuery.mock.calls[0][0];
  const params = mockQuery.mock.calls[0][1];
  expect(sql).toContain('LOWER(u.client_id) = LOWER($1)');
  expect(sql).not.toContain('user_roles');
  expect(sql).not.toContain('insta_post_roles');
  expect(sql).not.toContain('LOWER(r.role_name)');
  expect(params).toEqual(['c1']);
});

test('skips role filter for operator role', async () => {
  mockQuery.mockResolvedValueOnce({ rows: [] });
  mockQuery.mockResolvedValueOnce({ rows: [{ total_post: 0 }] });
  await getRekapLikesByClient('c1', 'harian', undefined, undefined, undefined, 'operator');
  const sql = mockQuery.mock.calls[0][0];
  const params = mockQuery.mock.calls[0][1];
  expect(sql).toContain('LOWER(u.client_id) = LOWER($1)');
  expect(sql).not.toContain('user_roles');
  expect(sql).not.toContain('insta_post_roles');
  expect(params).toEqual(['c1']);
});
