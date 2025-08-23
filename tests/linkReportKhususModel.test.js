import { jest } from '@jest/globals';

const mockQuery = jest.fn();

jest.unstable_mockModule('../src/repository/db.js', () => ({
  query: mockQuery
}));

let createLinkReport;
let getLinkReports;
let findLinkReportByShortcode;
let getReportsTodayByClient;
let getReportsTodayByShortcode;

beforeAll(async () => {
  const mod = await import('../src/model/linkReportKhususModel.js');
  createLinkReport = mod.createLinkReport;
  getLinkReports = mod.getLinkReports;
  findLinkReportByShortcode = mod.findLinkReportByShortcode;
  getReportsTodayByClient = mod.getReportsTodayByClient;
  getReportsTodayByShortcode = mod.getReportsTodayByShortcode;
});

beforeEach(() => {
  mockQuery.mockReset();
});

test('createLinkReport inserts row', async () => {
  mockQuery.mockResolvedValueOnce({ rows: [{ shortcode: 'abc' }] });
  const data = { shortcode: 'abc', user_id: '1', instagram_link: 'a' };
  const res = await createLinkReport(data);
  expect(res).toEqual({ shortcode: 'abc' });
  expect(mockQuery).toHaveBeenCalledWith(
    expect.stringContaining('FROM insta_post_khusus p'),
    ['abc', '1', 'a', null, null, null, null]
  );
});

test('createLinkReport throws when shortcode missing or not today', async () => {
  mockQuery.mockResolvedValueOnce({ rows: [] });
  await expect(createLinkReport({ shortcode: 'xyz' })).rejects.toThrow(
    'shortcode not found or not from today'
  );
  expect(mockQuery).toHaveBeenCalled();
});

test('getLinkReports joins with insta_post_khusus', async () => {
  mockQuery.mockResolvedValueOnce({ rows: [{ shortcode: 'abc', caption: 'c' }] });
  const rows = await getLinkReports();
  expect(rows).toEqual([{ shortcode: 'abc', caption: 'c' }]);
  expect(mockQuery).toHaveBeenCalledWith(
    expect.stringContaining('FROM link_report_khusus r')
  );
});

test('findLinkReportByShortcode joins with insta_post_khusus', async () => {
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
