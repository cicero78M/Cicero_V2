import { jest } from '@jest/globals';

const mockQuery = jest.fn();

jest.unstable_mockModule('../src/repository/db.js', () => ({
  query: mockQuery
}));

let createLinkReport;

beforeAll(async () => {
  const mod = await import('../src/model/linkReportModel.js');
  createLinkReport = mod.createLinkReport;
});

test('createLinkReport inserts row', async () => {
  mockQuery.mockResolvedValueOnce({ rows: [{ shortcode: 'abc' }] });
  const data = { shortcode: 'abc', user_id: '1', instagram_link: 'a' };
  const res = await createLinkReport(data);
  expect(res).toEqual({ shortcode: 'abc' });
  expect(mockQuery).toHaveBeenCalledWith(
    expect.stringContaining('INSERT INTO link_report'),
    ['abc', '1', 'a', null, null, null, null, null]
  );
});
