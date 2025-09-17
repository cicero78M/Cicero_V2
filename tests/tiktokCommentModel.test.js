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
  expect(mockQuery.mock.calls[1][0]).toContain('c.updated_at');
  expect(mockQuery.mock.calls[1][0]).toContain('BETWEEN $2::date AND $3::date');
  expect(mockQuery.mock.calls[1][1]).toEqual(['POLRES', '2024-01-01', '2024-01-31']);
});

test('getRekapKomentarByClient includes directorate role filter for ditbinmas', async () => {
  mockClientType('direktorat');
  mockQuery.mockResolvedValueOnce({ rows: [{ client_id: 'polresa' }] });
  mockQuery.mockResolvedValueOnce({ rows: [] });
  await getRekapKomentarByClient('ditbinmas', 'harian', undefined, undefined, undefined, 'ditbinmas');
  expect(mockQuery.mock.calls[0][0]).toContain('SELECT client_type FROM clients');
  expect(mockQuery.mock.calls[1][0]).toContain('dashboard_user_clients');
  const sql = mockQuery.mock.calls[2][0];
  expect(sql).not.toContain('tiktok_post_roles');
  expect(sql).toContain('LOWER(u.client_id) = ANY');
  expect(sql).toContain('LOWER(r.role_name) = ANY');
  const params = mockQuery.mock.calls[2][1];
  expect(params.at(-1)).toEqual(['ditbinmas', 'polresa']);
});
