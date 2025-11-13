import { jest } from '@jest/globals';

import { PRIORITY_USER_NAMES } from '../src/utils/constants.js';

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

const PRIORITY_UPPER = PRIORITY_USER_NAMES.map(name => name.toUpperCase());

function expectPriorityParams(actualParams, prefixLength) {
  expect(actualParams.slice(prefixLength)).toEqual(PRIORITY_UPPER);
}

test('getRekapKomentarByClient uses updated_at BETWEEN for date range', async () => {
  mockClientType();
  mockQuery.mockResolvedValueOnce({ rows: [] });
  await getRekapKomentarByClient('POLRES', 'harian', null, '2024-01-01', '2024-01-31');
  expect(mockQuery).toHaveBeenCalledTimes(2);
  expect(mockQuery.mock.calls[1][0]).toContain('c.updated_at');
  expect(mockQuery.mock.calls[1][0]).toContain('BETWEEN $2::date AND $3::date');
  const params = mockQuery.mock.calls[1][1];
  expect(params.slice(0, 3)).toEqual(['POLRES', '2024-01-01', '2024-01-31']);
  expectPriorityParams(params, 3);
});

test('getRekapKomentarByClient filters directorate users by ditbinmas role only', async () => {
  mockClientType('direktorat');
  mockQuery.mockResolvedValueOnce({ rows: [] });
  await getRekapKomentarByClient('ditbinmas', 'harian', undefined, undefined, undefined, 'ditbinmas');
  expect(mockQuery).toHaveBeenCalledTimes(2);
  expect(mockQuery.mock.calls[0][0]).toContain('SELECT client_type FROM clients');
  const sql = mockQuery.mock.calls[1][0];
  expect(sql).toContain('EXISTS (');
  expect(sql).toContain('LOWER(r.role_name) = LOWER(');
  expect(sql).toContain('LEFT JOIN tiktok_post_roles pr');
  expect(sql).toMatch(/LOWER\(pr\.role_name\) = LOWER\(\$\d+\)/);
  expect(sql).toContain('pr.video_id IS NOT NULL');
  expect(sql).toContain('NOT EXISTS (');
  expect(sql).not.toContain('LOWER(u.client_id) = ANY');
  const params = mockQuery.mock.calls[1][1];
  expect(params.slice(0, 1)).toEqual(['ditbinmas']);
  expectPriorityParams(params, 1);
});

test('getRekapKomentarByClient orders nama by priority list', async () => {
  mockClientType();
  mockQuery.mockResolvedValueOnce({ rows: [] });
  await getRekapKomentarByClient('POLRES');
  const sql = mockQuery.mock.calls[1][0];
  const params = mockQuery.mock.calls[1][1];
  expect(params.slice(0, 1)).toEqual(['POLRES']);
  expectPriorityParams(params, 1);
  const matches = sql.match(/WHEN UPPER\(u\.nama\) = \$\d+/g) || [];
  expect(matches.length).toBeGreaterThanOrEqual(PRIORITY_UPPER.length);
  expect(sql).toContain('CASE WHEN');
  expect(sql).toContain('UPPER(u.nama)');
});
