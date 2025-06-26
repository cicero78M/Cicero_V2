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

beforeAll(async () => {
  const mod = await import('../src/model/linkReportModel.js');
  createLinkReport = mod.createLinkReport;
  getLinkReports = mod.getLinkReports;
  findLinkReportByShortcode = mod.findLinkReportByShortcode;
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
