import { jest } from '@jest/globals';

const mockQuery = jest.fn();
jest.unstable_mockModule('../src/repository/db.js', () => ({
  query: mockQuery
}));

let findByClientId;
let getShortcodesTodayByClient;
beforeAll(async () => {
  ({ findByClientId, getShortcodesTodayByClient } = await import('../src/model/instaPostModel.js'));
});

beforeEach(() => {
  mockQuery.mockReset();
});

test('findByClientId uses DISTINCT ON to avoid duplicates', async () => {
  mockQuery.mockResolvedValueOnce({ rows: [] });
  await findByClientId('c1');
  expect(mockQuery).toHaveBeenCalledWith(
    expect.stringContaining('DISTINCT ON (shortcode)'),
    ['c1']
  );
});

test('getShortcodesTodayByClient filters by client for non-direktorat', async () => {
  mockQuery
    .mockResolvedValueOnce({ rows: [{ client_type: 'instansi' }] })
    .mockResolvedValueOnce({ rows: [] });
  await getShortcodesTodayByClient('C1');
  const sql = mockQuery.mock.calls[1][0];
  expect(sql).toContain('LOWER(client_id) = LOWER($1)');
  expect(sql).not.toContain('insta_post_roles');
});

test('getShortcodesTodayByClient uses role filter for directorate', async () => {
  mockQuery
    .mockResolvedValueOnce({ rows: [{ client_type: 'direktorat' }] })
    .mockResolvedValueOnce({ rows: [] });
  await getShortcodesTodayByClient('DITA');
  const sql = mockQuery.mock.calls[1][0];
  expect(sql).toContain('insta_post_roles');
  expect(sql).toContain('LOWER(pr.role_name) = LOWER($1)');
});

test('getShortcodesTodayByClient falls back to role when client not found', async () => {
  mockQuery
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rows: [] });
  await getShortcodesTodayByClient('ditbinmas');
  const sql = mockQuery.mock.calls[1][0];
  expect(sql).toContain('insta_post_roles');
  expect(sql).toContain('LOWER(pr.role_name) = LOWER($1)');
});
