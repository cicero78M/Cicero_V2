import { jest } from '@jest/globals';

const mockQuery = jest.fn();
const mockGetUsersByClient = jest.fn();
const mockGetUsersByDirektorat = jest.fn();
const mockGetShortcodesTodayByClient = jest.fn();
const mockGetReportsTodayByClient = jest.fn();
const mockGetReportsTodayByShortcode = jest.fn();

jest.unstable_mockModule('../src/db/index.js', () => ({ query: mockQuery }));
jest.unstable_mockModule('../src/model/userModel.js', () => ({
  getUsersByClient: mockGetUsersByClient,
  getUsersByDirektorat: mockGetUsersByDirektorat,
}));
jest.unstable_mockModule('../src/model/instaPostModel.js', () => ({
  getShortcodesTodayByClient: mockGetShortcodesTodayByClient,
}));
jest.unstable_mockModule('../src/model/linkReportModel.js', () => ({
  getReportsTodayByClient: mockGetReportsTodayByClient,
  getReportsTodayByShortcode: mockGetReportsTodayByShortcode,
}));

let absensiLink;

beforeAll(async () => {
  ({ absensiLink } = await import('../src/handler/fetchabsensi/link/absensiLinkAmplifikasi.js'));
});

beforeEach(() => {
  jest.clearAllMocks();
});

test('filters users by roleFlag when provided', async () => {
  mockQuery.mockResolvedValueOnce({ rows: [{ nama: 'POLRES ABC', client_type: 'instansi' }] });
  mockGetUsersByClient.mockResolvedValueOnce([]);
  mockGetShortcodesTodayByClient.mockResolvedValueOnce([]);

  await absensiLink('POLRES', { roleFlag: 'ditbinmas' });

  expect(mockGetUsersByClient).toHaveBeenCalledWith('POLRES', 'ditbinmas');
  expect(mockGetUsersByDirektorat).not.toHaveBeenCalled();
});
