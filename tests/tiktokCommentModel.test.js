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

test('getRekapKomentarByClient uses BETWEEN for date range', async () => {
  mockQuery
    .mockResolvedValueOnce({ rows: [{ jumlah_post: '2' }] })
    .mockResolvedValueOnce({ rows: [] });
  await getRekapKomentarByClient('POLRES', 'harian', null, '2024-01-01', '2024-01-31');
  expect(mockQuery).toHaveBeenCalledTimes(2);
  expect(mockQuery).toHaveBeenNthCalledWith(
    1,
    expect.stringContaining('BETWEEN $2::date AND $3::date'),
    ['POLRES', '2024-01-01', '2024-01-31']
  );
  expect(mockQuery).toHaveBeenNthCalledWith(
    2,
    expect.stringContaining('BETWEEN $2::date AND $3::date'),
    ['POLRES', '2024-01-01', '2024-01-31']
  );
});
