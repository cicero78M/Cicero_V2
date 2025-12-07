import { jest } from '@jest/globals';

const mockQuery = jest.fn();

jest.unstable_mockModule('../src/repository/db.js', () => ({
  query: mockQuery,
}));

let getPostsTodayByClient;
let getVideoIdsTodayByClient;

const toJakartaDateInput = (date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(date);

beforeAll(async () => {
  ({ getPostsTodayByClient, getVideoIdsTodayByClient } = await import(
    '../src/model/tiktokPostModel.js'
  ));
});

beforeEach(() => {
  mockQuery.mockReset();
});

afterEach(() => {
  jest.useRealTimers();
});

test('getPostsTodayByClient filters by Jakarta date and orders results', async () => {
  jest.useFakeTimers().setSystemTime(new Date('2024-07-01T17:00:00.000Z'));
  mockQuery.mockResolvedValueOnce({ rows: [] });

  const expectedDate = toJakartaDateInput(new Date('2024-07-01T17:00:00.000Z'));

  await getPostsTodayByClient('Client 1');

  expect(mockQuery).toHaveBeenCalledWith(
    expect.stringMatching(/AT TIME ZONE 'Asia\/Jakarta'\)\:\:date = \$2\:\:date/i),
    ['client 1', expectedDate]
  );
  expect(mockQuery.mock.calls[0][0]).toMatch(/ORDER BY\s+created_at\s+ASC,\s+video_id\s+ASC/i);
});

test('getPostsTodayByClient respects Jakarta-normalized referenceDate on non-WIB servers', async () => {
  const originalTZ = process.env.TZ;
  process.env.TZ = 'America/New_York';
  mockQuery.mockResolvedValueOnce({ rows: [] });

  try {
    const referenceDate = new Date('2024-06-30T17:00:00.000Z');
    const expectedDate = toJakartaDateInput(referenceDate);

    await getPostsTodayByClient('Client 2', referenceDate);

    expect(mockQuery).toHaveBeenCalledWith(
      expect.any(String),
      ['client 2', expectedDate]
    );
  } finally {
    process.env.TZ = originalTZ;
  }
});

test('getVideoIdsTodayByClient applies Jakarta date filter for reference date', async () => {
  mockQuery.mockResolvedValueOnce({ rows: [] });
  const referenceDate = new Date('2024-05-10T18:30:00.000Z');
  const expectedDate = toJakartaDateInput(referenceDate);

  await getVideoIdsTodayByClient('Client 3', referenceDate);

  expect(mockQuery).toHaveBeenCalledWith(
    expect.stringMatching(/AT TIME ZONE 'Asia\/Jakarta'\)\:\:date = \$2\:\:date/i),
    ['client 3', expectedDate]
  );
});

