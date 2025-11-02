import { jest } from '@jest/globals';

const mockQuery = jest.fn();

jest.unstable_mockModule('../src/repository/db.js', () => ({
  query: mockQuery,
}));

let getRekapKomentarByClient;

beforeAll(async () => {
  ({ getRekapKomentarByClient } = await import('../src/model/tiktokCommentModel.js'));
});

beforeEach(() => {
  mockQuery.mockReset();
});

function mockClientType(type = 'instansi') {
  mockQuery.mockResolvedValueOnce({ rows: [{ client_type: type }] });
}

test('getRekapKomentarByClient uses updated_at BETWEEN for date range', async () => {
  mockClientType();
  mockQuery.mockResolvedValueOnce({ rows: [] });
  await getRekapKomentarByClient('POLRES', 'harian', null, '2024-01-01', '2024-01-31');
  expect(mockQuery).toHaveBeenCalledTimes(2);
  expect(mockQuery.mock.calls[0][0]).toContain('LOWER(TRIM(client_id)) = $1');
  expect(mockQuery.mock.calls[0][1]).toEqual(['polres']);
  expect(mockQuery.mock.calls[1][0]).toContain('c.updated_at');
  expect(mockQuery.mock.calls[1][0]).toContain('BETWEEN $2::date AND $3::date');
  expect(mockQuery.mock.calls[1][1]).toEqual(['polres', '2024-01-01', '2024-01-31']);
});

test('getRekapKomentarByClient filters directorate users by ditbinmas role only', async () => {
  mockClientType('direktorat');
  mockQuery.mockResolvedValueOnce({ rows: [] });
  await getRekapKomentarByClient('ditbinmas', 'harian', undefined, undefined, undefined, 'ditbinmas');
  expect(mockQuery).toHaveBeenCalledTimes(2);
  expect(mockQuery.mock.calls[0][0]).toContain('SELECT client_type FROM clients');
  const sql = mockQuery.mock.calls[1][0];
  expect(sql).toContain('LOWER(TRIM(p.client_id))');
  expect(sql).toContain('LOWER(TRIM(u.client_id))');
  expect(sql).toContain('LOWER(TRIM(r.role_name))');
  const params = mockQuery.mock.calls[1][1];
  expect(params).toEqual(['ditbinmas', 'ditbinmas']);
});

test('directorate recap always restricts to ditbinmas regardless of requested client', async () => {
  mockClientType('direktorat');
  mockQuery.mockResolvedValueOnce({ rows: [] });
  await getRekapKomentarByClient('ditsamapta', 'harian', undefined, undefined, undefined, 'ditsamapta');
  expect(mockQuery).toHaveBeenCalledTimes(2);
  const sql = mockQuery.mock.calls[1][0];
  expect(sql).toContain('LOWER(TRIM(p.client_id)) = $1');
  expect(sql).toContain('LOWER(TRIM(u.client_id)) = $1');
  const params = mockQuery.mock.calls[1][1];
  expect(params).toEqual(['ditbinmas', 'ditbinmas']);
});
