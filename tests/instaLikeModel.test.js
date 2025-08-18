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

function mockClientType(type = 'regular') {
  mockQuery.mockResolvedValueOnce({ rows: [{ client_type: type }] });
}

test('harian with specific date uses date filter', async () => {
  mockClientType();
  mockQuery.mockResolvedValueOnce({ rows: [] });
  await getRekapLikesByClient('1', 'harian', '2023-10-05');
  const expected = "p.created_at::date = $2::date";
  expect(mockQuery).toHaveBeenNthCalledWith(2, expect.stringContaining(expected), ['1', '2023-10-05']);
});

test('mingguan with date truncs week', async () => {
  mockClientType();
  mockQuery.mockResolvedValueOnce({ rows: [] });
  await getRekapLikesByClient('1', 'mingguan', '2023-10-05');
  const expected = "date_trunc('week', p.created_at) = date_trunc('week', $2::date)";
  expect(mockQuery).toHaveBeenNthCalledWith(2, expect.stringContaining(expected), ['1', '2023-10-05']);
});

test('bulanan converts month string', async () => {
  mockClientType();
  mockQuery.mockResolvedValueOnce({ rows: [] });
  await getRekapLikesByClient('1', 'bulanan', '2023-10');
  const expected = "date_trunc('month', p.created_at AT TIME ZONE 'Asia/Jakarta') = date_trunc('month', $2::date)";
  expect(mockQuery).toHaveBeenNthCalledWith(2, expect.stringContaining(expected), ['1', '2023-10-01']);
});

test('semua uses no date filter', async () => {
  mockClientType();
  mockQuery.mockResolvedValueOnce({ rows: [] });
  await getRekapLikesByClient('1', 'semua');
  expect(mockQuery).toHaveBeenNthCalledWith(2, expect.stringContaining('1=1'), ['1']);
});

test('date range uses between filter', async () => {
  mockClientType();
  mockQuery.mockResolvedValueOnce({ rows: [] });
  await getRekapLikesByClient('1', 'harian', undefined, '2023-10-01', '2023-10-07');
  const expected = "(p.created_at AT TIME ZONE 'Asia/Jakarta')::date BETWEEN $2::date AND $3::date";
  expect(mockQuery).toHaveBeenNthCalledWith(2, expect.stringContaining(expected), ['1', '2023-10-01', '2023-10-07']);
});

test('query normalizes instagram usernames', async () => {
  mockClientType();
  mockQuery.mockResolvedValueOnce({ rows: [] });
  await getRekapLikesByClient('1');
  expect(mockQuery).toHaveBeenNthCalledWith(2, expect.stringContaining('jsonb_array_elements(l.likes)'), ['1']);
});

test('parses jumlah_like as integer', async () => {
  mockClientType();
  mockQuery.mockResolvedValueOnce({ rows: [{
    user_id: 'u1',
    title: 'Aiptu',
    nama: 'Budi',
    username: 'budi',
    divisi: 'BAG',
    exception: false,
    jumlah_like: '3',
  }] });
  const rows = await getRekapLikesByClient('1');
  expect(rows[0].jumlah_like).toBe(3);
});

test('filters users by client_id for non-directorate clients', async () => {
  mockClientType('regular');
  mockQuery.mockResolvedValueOnce({ rows: [] });
  await getRekapLikesByClient('1');
  const sql = mockQuery.mock.calls[1][0];
  expect(sql).toContain('LOWER(u.client_id) = LOWER($1)');
  expect(sql).not.toContain('user_roles');
});

test('filters users by role for directorate clients', async () => {
  mockClientType('direktorat');
  mockQuery.mockResolvedValueOnce({ rows: [] });
  await getRekapLikesByClient('ditbinmas', 'harian');
  const sql = mockQuery.mock.calls[1][0];
  const params = mockQuery.mock.calls[1][1];
  expect(sql).toContain('user_roles ur');
  expect(sql).toContain('roles r');
  expect(sql).toContain('EXISTS');
  expect(sql).toContain('LOWER(r.role_name) = LOWER($1)');
  expect(sql).not.toContain('LOWER(p.client_id) = LOWER($1)');
  expect(sql).not.toContain('LOWER(u.client_id) = LOWER($1)');
  expect(params).toEqual(['ditbinmas']);
});

test('filters users by role for non-directorate clients', async () => {
  mockClientType('regular');
  mockQuery.mockResolvedValueOnce({ rows: [] });
  await getRekapLikesByClient('c1', 'harian', undefined, undefined, undefined, 'ditbinmas');
  const sql = mockQuery.mock.calls[1][0];
  const params = mockQuery.mock.calls[1][1];
  expect(sql).toContain('LOWER(u.client_id) = LOWER($1)');
  expect(sql).toContain('LOWER(r.role_name) = LOWER($2)');
  expect(params).toEqual(['c1', 'ditbinmas']);
});

test('skips role filter for operator role on non-directorate clients', async () => {
  mockClientType('regular');
  mockQuery.mockResolvedValueOnce({ rows: [] });
  await getRekapLikesByClient('c1', 'harian', undefined, undefined, undefined, 'operator');
  const sql = mockQuery.mock.calls[1][0];
  expect(sql).toContain('LOWER(u.client_id) = LOWER($1)');
  expect(sql).not.toContain('user_roles');
});

test('aggregates likes across multiple client IDs for directorate role', async () => {
  mockClientType('direktorat');
  mockQuery.mockResolvedValueOnce({
    rows: [
      {
        user_id: 'u1',
        title: 'Aipda',
        nama: 'Andi',
        username: 'andi',
        divisi: 'BAG',
        exception: false,
        client_id: 'c1',
        client_name: 'Client 1',
        jumlah_like: '2',
      },
      {
        user_id: 'u2',
        title: 'Aipda',
        nama: 'Budi',
        username: 'budi',
        divisi: 'BAG',
        exception: false,
        client_id: 'c2',
        client_name: 'Client 2',
        jumlah_like: '3',
      },
    ],
  });
  const rows = await getRekapLikesByClient('ditbinmas', 'harian');
  const sql = mockQuery.mock.calls[1][0];
  const params = mockQuery.mock.calls[1][1];
  expect(sql).toContain('LOWER(r.role_name) = LOWER($1)');
  expect(sql).not.toContain('LOWER(p.client_id) = LOWER($1)');
  expect(sql).not.toContain('LOWER(u.client_id) = LOWER($1)');
  expect(params).toEqual(['ditbinmas']);
  expect(rows).toHaveLength(2);
  expect(rows.map(r => r.client_id)).toEqual(['c1', 'c2']);
});

test('applies explicit clientId filter for directorate clients', async () => {
  mockClientType('direktorat');
  mockQuery.mockResolvedValueOnce({ rows: [] });
  await getRekapLikesByClient('ditbinmas', 'harian', undefined, undefined, undefined, undefined, 'c1');
  const sql = mockQuery.mock.calls[1][0];
  const params = mockQuery.mock.calls[1][1];
  expect(sql).toContain('LOWER(r.role_name) = LOWER($1)');
  expect(sql).toContain('LOWER(p.client_id) = LOWER($2)');
  expect(sql).toContain('LOWER(u.client_id) = LOWER($2)');
  expect(params).toEqual(['ditbinmas', 'c1']);
});
