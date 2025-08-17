import { jest } from '@jest/globals';

const mockGetRekap = jest.fn();
jest.unstable_mockModule('../src/model/linkReportKhususModel.js', () => ({
  getRekapLinkByClient: mockGetRekap
}));
jest.unstable_mockModule('../src/middleware/debugHandler.js', () => ({
  sendConsoleDebug: jest.fn()
}));

let getAmplifyKhususRekap;
beforeAll(async () => {
  ({ getAmplifyKhususRekap } = await import('../src/controller/amplifyKhususController.js'));
});

beforeEach(() => {
  mockGetRekap.mockReset();
});

test('returns 403 when client_id unauthorized', async () => {
  const req = { query: { client_id: 'c2' }, user: { client_ids: ['c1'] } };
  const json = jest.fn();
  const res = { json, status: jest.fn().mockReturnThis() };
  await getAmplifyKhususRekap(req, res);
  expect(res.status).toHaveBeenCalledWith(403);
  expect(json).toHaveBeenCalledWith({ success: false, message: 'client_id tidak diizinkan' });
  expect(mockGetRekap).not.toHaveBeenCalled();
});

test('allows authorized client_id', async () => {
  mockGetRekap.mockResolvedValue([]);
  const req = { query: { client_id: 'c1' }, user: { client_ids: ['c1'] } };
  const json = jest.fn();
  const res = { json, status: jest.fn().mockReturnThis() };
  await getAmplifyKhususRekap(req, res);
  expect(res.status).not.toHaveBeenCalledWith(403);
  expect(mockGetRekap).toHaveBeenCalledWith('c1', 'harian', undefined);
  expect(json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
});
