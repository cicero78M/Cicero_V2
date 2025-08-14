import { jest } from '@jest/globals';

const mockGetRekap = jest.fn();
jest.unstable_mockModule('../src/model/linkReportModel.js', () => ({
  getRekapLinkByClient: mockGetRekap
}));
jest.unstable_mockModule('../src/middleware/debugHandler.js', () => ({
  sendConsoleDebug: jest.fn()
}));

let getAmplifyRekap;
beforeAll(async () => {
  ({ getAmplifyRekap } = await import('../src/controller/amplifyController.js'));
});

beforeEach(() => {
  mockGetRekap.mockReset();
});

test('accepts tanggal_mulai and tanggal_selesai', async () => {
  mockGetRekap.mockResolvedValue([]);
  const req = {
    query: {
      client_id: 'c1',
      periode: 'harian',
      tanggal_mulai: '2024-01-01',
      tanggal_selesai: '2024-01-31'
    }
  };
  const json = jest.fn();
  const res = { json, status: jest.fn().mockReturnThis() };
  await getAmplifyRekap(req, res);
  expect(mockGetRekap).toHaveBeenCalledWith('c1', 'harian', undefined, '2024-01-01', '2024-01-31');
  expect(json).toHaveBeenCalledWith(expect.objectContaining({ chartHeight: 300 }));
});

