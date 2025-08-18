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

function mockClientType(type = 'instansi') {
  mockQuery.mockResolvedValueOnce({ rows: [{ client_type: type }] });
}

test('createLinkReport inserts row', async () => {
  const today = new Date().toISOString();
  mockFindPost.mockResolvedValueOnce({ shortcode: 'abc', created_at: today });
  mockQuery.mockResolvedValueOnce({ rows: [{ shortcode: 'abc' }] });
  const data = { shortcode: 'abc', user_id: '1', instagram_link: 'a' };
  const res = await createLinkReport(data);
  expect(res).toEqual({ shortcode: 'abc' });
  expect(mockFindPost).toHaveBeenCalledWith('abc');
  expect(mockQuery).toHaveBeenCalledWith(
    expect.stringContaining('ON CONFLICT (shortcode, user_id)'),
    ['abc', '1', 'a', null, null, null, null, today]
  );
});

test('createLinkReport throws if post missing', async () => {
  mockFindPost.mockResolvedValueOnce(null);
  await expect(createLinkReport({ shortcode: 'xyz' })).rejects.toThrow('shortcode not found');
  expect(mockFindPost).toHaveBeenCalledWith('xyz');
  expect(mockQuery).not.toHaveBeenCalled();
});

test('createLinkReport rejects if post not from today', async () => {
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  mockFindPost.mockResolvedValueOnce({ shortcode: 'abc', created_at: yesterday });
  await expect(
    createLinkReport({ shortcode: 'abc', user_id: '1', instagram_link: 'a' })
  ).rejects.toThrow("reports can only be created for today's posts");
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

test('getReportsTodayByClient joins insta_post and filters by date', async () => {
  mockQuery
    .mockResolvedValueOnce({ rows: [{ client_type: 'instansi' }] })
    .mockResolvedValueOnce({ rows: [{ shortcode: 'x' }] });
  const rows = await getReportsTodayByClient('POLRES');
  expect(rows).toEqual([{ shortcode: 'x' }]);
  expect(mockQuery).toHaveBeenNthCalledWith(
    1,
    expect.stringContaining('SELECT client_type FROM clients'),
    ['POLRES']
  );
  const sql = mockQuery.mock.calls[1][0];
  expect(sql).toContain('JOIN insta_post p ON p.shortcode = r.shortcode');
  expect(sql).toContain('JOIN "user" u ON u.user_id = r.user_id');
  expect(sql).toContain("p.created_at::date = (NOW() AT TIME ZONE 'Asia/Jakarta')::date");
  expect(sql).toContain("r.created_at::date = (NOW() AT TIME ZONE 'Asia/Jakarta')::date");
});

test('getReportsTodayByShortcode filters by client and shortcode', async () => {
  mockQuery
    .mockResolvedValueOnce({ rows: [{ client_type: 'instansi' }] })
    .mockResolvedValueOnce({ rows: [{ shortcode: 'abc' }] });
  const rows = await getReportsTodayByShortcode('POLRES', 'abc');
  expect(rows).toEqual([{ shortcode: 'abc' }]);
  expect(mockQuery).toHaveBeenNthCalledWith(
    1,
    expect.stringContaining('SELECT client_type FROM clients'),
    ['POLRES']
  );
  expect(mockQuery).toHaveBeenNthCalledWith(
    2,
    expect.stringContaining('r.shortcode = $2'),
    ['POLRES', 'abc']
  );
});

test('getReportsTodayByClient uses role filter for directorate', async () => {
  mockQuery
    .mockResolvedValueOnce({ rows: [{ client_type: 'direktorat' }] })
    .mockResolvedValueOnce({ rows: [] });
  await getReportsTodayByClient('ditbinmas');
  const sql = mockQuery.mock.calls[1][0];
  expect(sql).toContain('user_roles');
  expect(sql).toContain('roles');
  expect(sql).toContain('role_name = $1');
});

test('getReportsTodayByShortcode uses role filter for directorate', async () => {
  mockQuery
    .mockResolvedValueOnce({ rows: [{ client_type: 'direktorat' }] })
    .mockResolvedValueOnce({ rows: [] });
  await getReportsTodayByShortcode('ditbinmas', 'abc');
  const sql = mockQuery.mock.calls[1][0];
  expect(sql).toContain('user_roles');
  expect(sql).toContain('roles');
  expect(sql).toContain('role_name = $1');
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
  mockClientType();
  mockQuery
    .mockResolvedValueOnce({ rows: [{ jumlah_post: '1' }] })
    .mockResolvedValueOnce({ rows: [] });
  await getRekapLinkByClient('POLRES', 'harian', '2024-01-02');
  expect(mockQuery).toHaveBeenNthCalledWith(
    2,
    expect.stringContaining('FROM insta_post p'),
    ['POLRES', '2024-01-02']
  );
  expect(mockQuery).toHaveBeenNthCalledWith(
    3,
    expect.stringContaining('link_sum AS'),
    ['POLRES', '2024-01-02']
  );
});

test('getRekapLinkByClient handles start_date and end_date', async () => {
  mockClientType();
  mockQuery
    .mockResolvedValueOnce({ rows: [{ jumlah_post: '2' }] })
    .mockResolvedValueOnce({ rows: [] });
  await getRekapLinkByClient('POLRES', 'harian', null, '2024-01-01', '2024-01-31');
  expect(mockQuery).toHaveBeenCalledTimes(3);
  expect(mockQuery).toHaveBeenNthCalledWith(
    2,
    expect.stringContaining('BETWEEN $2::date AND $3::date'),
    ['POLRES', '2024-01-01', '2024-01-31']
  );
  expect(mockQuery).toHaveBeenNthCalledWith(
    3,
    expect.stringContaining('BETWEEN $2::date AND $3::date'),
    ['POLRES', '2024-01-01', '2024-01-31']
  );
});

test('getRekapLinkByClient applies post date filter in link_sum', async () => {
  mockClientType();
  mockQuery
    .mockResolvedValueOnce({ rows: [{ jumlah_post: '0' }] })
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
  await getRekapLinkByClient('POLRES');
  const sql = mockQuery.mock.calls[2][0];
  expect(sql).toContain('p.created_at');
  expect(sql).toContain('r.created_at');
});

test('getRekapLinkByClient marks sudahMelaksanakan when user has links', async () => {
  mockClientType();
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

test('getRekapLinkByClient includes directorate role filter for ditbinmas', async () => {
  mockClientType('direktorat');
  mockQuery
    .mockResolvedValueOnce({ rows: [{ jumlah_post: '0' }] })
    .mockResolvedValueOnce({ rows: [] });
  await getRekapLinkByClient('ditbinmas', 'harian', undefined, undefined, undefined, 'ditbinmas');
  expect(mockQuery.mock.calls[0][0]).toContain('SELECT client_type FROM clients');
  const sql = mockQuery.mock.calls[2][0];
  expect(sql).toContain('insta_post_roles');
  expect(sql).toContain('user_roles');
});
