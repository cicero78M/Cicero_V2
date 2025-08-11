import { jest } from '@jest/globals';

const mockQuery = jest.fn();
const mockFindPost = jest.fn();

jest.unstable_mockModule('../src/repository/db.js', () => ({
  query: mockQuery
}));
jest.unstable_mockModule('../src/model/instaPostModel.js', () => ({
  findPostByShortcode: mockFindPost
}));

let createLinkReport;
let getLinkReports;
let findLinkReportByShortcode;
let getReportsTodayByClient;
let getReportsTodayByShortcode;
let getReportsThisMonthByClient;
let getRekapLinkByClient;

beforeAll(async () => {
  const mod = await import('../src/model/linkReportModel.js');
  createLinkReport = mod.createLinkReport;
  getLinkReports = mod.getLinkReports;
  findLinkReportByShortcode = mod.findLinkReportByShortcode;
  getReportsTodayByClient = mod.getReportsTodayByClient;
  getReportsTodayByShortcode = mod.getReportsTodayByShortcode;
  getReportsThisMonthByClient = mod.getReportsThisMonthByClient;
  getRekapLinkByClient = mod.getRekapLinkByClient;
});

beforeEach(() => {
  mockQuery.mockReset();
  mockFindPost.mockReset();
});

test('createLinkReport inserts row', async () => {
  mockFindPost.mockResolvedValueOnce({ shortcode: 'abc' });
  mockQuery.mockResolvedValueOnce({ rows: [{ shortcode: 'abc' }] });
  const data = { shortcode: 'abc', user_id: '1', instagram_link: 'a' };
  const res = await createLinkReport(data);
  expect(res).toEqual({ shortcode: 'abc' });
  expect(mockFindPost).toHaveBeenCalledWith('abc');
  expect(mockQuery).toHaveBeenCalledWith(
    expect.stringContaining('ON CONFLICT (shortcode, user_id)'),
    ['abc', '1', 'a', null, null, null, null, null]
  );
});

test('createLinkReport throws if post missing', async () => {
  mockFindPost.mockResolvedValueOnce(null);
  await expect(createLinkReport({ shortcode: 'xyz' })).rejects.toThrow('shortcode not found');
  expect(mockFindPost).toHaveBeenCalledWith('xyz');
  expect(mockQuery).not.toHaveBeenCalled();
});

test('getLinkReports joins with insta_post', async () => {
  mockQuery.mockResolvedValueOnce({ rows: [{ shortcode: 'abc', caption: 'c' }] });
  const rows = await getLinkReports();
  expect(rows).toEqual([{ shortcode: 'abc', caption: 'c' }]);
  expect(mockQuery).toHaveBeenCalledWith(
    expect.stringContaining('FROM link_report r')
  );
});

test('findLinkReportByShortcode joins with insta_post', async () => {
  mockQuery.mockResolvedValueOnce({ rows: [{ shortcode: 'abc', caption: 'c' }] });
  const row = await findLinkReportByShortcode('abc', '1');
  expect(row).toEqual({ shortcode: 'abc', caption: 'c' });
  expect(mockQuery).toHaveBeenCalledWith(
    expect.stringContaining('WHERE r.shortcode = $1'),
    ['abc', '1']
  );
});

test('getReportsTodayByClient filters by client', async () => {
  mockQuery.mockResolvedValueOnce({ rows: [{ shortcode: 'x' }] });
  const rows = await getReportsTodayByClient('POLRES');
  expect(rows).toEqual([{ shortcode: 'x' }]);
  expect(mockQuery).toHaveBeenCalledWith(
    expect.stringContaining('JOIN "user" u ON u.user_id = r.user_id'),
    ['POLRES']
  );
});

test('getReportsTodayByShortcode filters by client and shortcode', async () => {
  mockQuery.mockResolvedValueOnce({ rows: [{ shortcode: 'abc' }] });
  const rows = await getReportsTodayByShortcode('POLRES', 'abc');
  expect(rows).toEqual([{ shortcode: 'abc' }]);
  expect(mockQuery).toHaveBeenCalledWith(
    expect.stringContaining('r.shortcode = $2'),
    ['POLRES', 'abc']
  );
});

test('getReportsThisMonthByClient selects monthly rows', async () => {
  mockQuery.mockResolvedValueOnce({ rows: [{ date: '2024-01-01' }] });
  const rows = await getReportsThisMonthByClient('POLRES');
  expect(rows).toEqual([{ date: '2024-01-01' }]);
  expect(mockQuery).toHaveBeenCalledWith(
    expect.stringContaining("date_trunc('month', r.created_at AT TIME ZONE 'Asia/Jakarta')"),
    ['POLRES']
  );
});

test('getRekapLinkByClient uses provided date', async () => {
  mockQuery
    .mockResolvedValueOnce({ rows: [{ jumlah_post: '1' }] })
    .mockResolvedValueOnce({ rows: [] });
  await getRekapLinkByClient('POLRES', 'harian', '2024-01-02');
  expect(mockQuery).toHaveBeenNthCalledWith(
    1,
    expect.stringContaining('p.created_at::date = $2::date'),
    ['POLRES', '2024-01-02']
  );
  expect(mockQuery).toHaveBeenNthCalledWith(
    2,
    expect.stringContaining('r.created_at::date = $2::date'),
    ['POLRES', '2024-01-02']
  );
});

test('getRekapLinkByClient handles start_date and end_date', async () => {
  mockQuery
    .mockResolvedValueOnce({ rows: [{ jumlah_post: '2' }] })
    .mockResolvedValueOnce({ rows: [] });
  await getRekapLinkByClient('POLRES', 'harian', null, '2024-01-01', '2024-01-31');
  expect(mockQuery).toHaveBeenCalledTimes(2);
  expect(mockQuery).toHaveBeenNthCalledWith(
    1,
    expect.stringContaining("(p.created_at AT TIME ZONE 'Asia/Jakarta')::date BETWEEN $2::date AND $3::date"),
    ['POLRES', '2024-01-01', '2024-01-31']
  );
  expect(mockQuery).toHaveBeenNthCalledWith(
    2,
    expect.stringContaining("(r.created_at AT TIME ZONE 'Asia/Jakarta')::date BETWEEN $2::date AND $3::date"),
    ['POLRES', '2024-01-01', '2024-01-31']
  );
});

test('getRekapLinkByClient marks sudahMelaksanakan when user has links', async () => {
  mockQuery
    .mockResolvedValueOnce({ rows: [{ jumlah_post: '1' }] })
    .mockResolvedValueOnce({
      rows: [
        {
          user_id: 'u1',
          title: 'Aiptu',
          nama: 'Budi',
          username: 'budi',
          divisi: 'Humas',
          exception: false,
          jumlah_link: 1
        }
      ]
    });
  const rows = await getRekapLinkByClient('POLRES');
  expect(rows[0].sudahMelaksanakan).toBe(true);
});
