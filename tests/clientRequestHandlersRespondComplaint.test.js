import { jest } from '@jest/globals';

const mockAbsensiRegistrasiDashboardDitbinmas = jest.fn();
const mockSafeSendMessage = jest.fn();
const mockFormatNama = jest.fn();
const mockNormalizeUserId = jest.fn();
const mockGetGreeting = jest.fn();
const mockFormatToWhatsAppId = jest.fn();

jest.unstable_mockModule('../src/handler/fetchabsensi/dashboard/absensiRegistrasiDashboardDitbinmas.js', () => ({
  absensiRegistrasiDashboardDitbinmas: mockAbsensiRegistrasiDashboardDitbinmas,
}));

jest.unstable_mockModule('../src/utils/utilsHelper.js', () => ({
  formatClientInfo: jest.fn(),
  groupByDivision: jest.fn(),
  sortDivisionKeys: jest.fn(),
  formatNama: mockFormatNama,
  normalizeUserId: mockNormalizeUserId,
  getGreeting: mockGetGreeting,
}));

jest.unstable_mockModule('../src/utils/waHelper.js', () => ({
  getAdminWANumbers: jest.fn(),
  getAdminWAIds: jest.fn(),
  sendWAFile: jest.fn(),
  formatToWhatsAppId: mockFormatToWhatsAppId,
  safeSendMessage: mockSafeSendMessage,
}));

jest.unstable_mockModule('../src/db/index.js', () => ({ query: jest.fn() }));
jest.unstable_mockModule('../src/service/linkReportExcelService.js', () => ({
  saveLinkReportExcel: jest.fn(),
}));
jest.unstable_mockModule('../src/service/googleContactsService.js', () => ({
  saveContactIfNew: jest.fn(),
}));
jest.unstable_mockModule('../src/model/linkReportModel.js', () => ({}));
jest.unstable_mockModule('../src/handler/fetchengagement/fetchLikesInstagram.js', () => ({
  handleFetchLikesInstagram: jest.fn(),
}));
jest.unstable_mockModule('../src/handler/fetchabsensi/tiktok/absensiKomentarTiktok.js', () => ({
  absensiKomentar: jest.fn(),
  absensiKomentarTiktokPerKonten: jest.fn(),
  absensiKomentarDitbinmasReport: jest.fn(),
}));

process.env.JWT_SECRET = 'test';

let clientRequestHandlers;

beforeAll(async () => {
  ({ clientRequestHandlers } = await import('../src/handler/menu/clientRequestHandlers.js'));
});

beforeEach(() => {
  jest.clearAllMocks();
  mockGetGreeting.mockReturnValue('Salam');
  mockFormatNama.mockReturnValue('Pelapor');
  mockNormalizeUserId.mockImplementation((value) => value.trim());
  mockFormatToWhatsAppId.mockImplementation((value) => `${value}@wa`);
});

test('respondComplaint_nrp automatically sends default response when social usernames are empty', async () => {
  const session = {};
  const chatId = 'admin-chat';
  const waClient = { sendMessage: jest.fn() };
  const userModel = {
    findUserById: jest.fn().mockResolvedValue({
      whatsapp: '08123',
      insta: '   ',
      tiktok: null,
      nama: 'Nama Lengkap',
    }),
  };

  await clientRequestHandlers.respondComplaint_nrp(
    session,
    chatId,
    ' 12345 ',
    waClient,
    null,
    userModel
  );

  expect(mockNormalizeUserId).toHaveBeenCalledWith('12345');
  expect(mockSafeSendMessage).toHaveBeenCalledWith(
    waClient,
    '08123@wa',
    expect.stringContaining('Akun sosial media masih belum terisi')
  );
  expect(waClient.sendMessage).toHaveBeenCalledWith(
    chatId,
    '✅ Respon komplain telah dikirim ke Pelapor (12345).'
  );
  expect(session.step).toBe('main');
  expect(session.respondComplaint).toBeUndefined();
});

test('respondComplaint_nrp continues manual flow when social username exists', async () => {
  const session = {};
  const chatId = 'admin-chat';
  const waClient = { sendMessage: jest.fn() };
  const userModel = {
    findUserById: jest.fn().mockResolvedValue({
      whatsapp: '08123',
      insta: 'username',
      tiktok: '',
      nama: 'Nama Lengkap',
    }),
  };

  await clientRequestHandlers.respondComplaint_nrp(
    session,
    chatId,
    ' 12345 ',
    waClient,
    null,
    userModel
  );

  expect(mockSafeSendMessage).not.toHaveBeenCalled();
  expect(waClient.sendMessage).toHaveBeenCalledWith(
    chatId,
    'Tuliskan ringkasan *kendala* dari pelapor (atau ketik *batal* untuk keluar):'
  );
  expect(session.step).toBe('respondComplaint_issue');
  expect(session.respondComplaint).toEqual({ nrp: '12345', user: expect.any(Object) });
});

test('respondComplaint_solution uses helper to send message and reset session', async () => {
  const session = {
    respondComplaint: {
      nrp: '12345',
      user: { whatsapp: '08123', nama: 'Nama Lengkap' },
      issue: 'Masalah A',
    },
  };
  const chatId = 'admin-chat';
  const waClient = { sendMessage: jest.fn() };

  await clientRequestHandlers.respondComplaint_solution(
    session,
    chatId,
    ' Solusi B ',
    waClient
  );

  expect(mockSafeSendMessage).toHaveBeenCalledWith(
    waClient,
    '08123@wa',
    expect.stringContaining('Solusi/Tindak Lanjut')
  );
  expect(waClient.sendMessage).toHaveBeenCalledWith(
    chatId,
    '✅ Respon komplain telah dikirim ke Pelapor (12345).'
  );
  expect(session.respondComplaint).toBeUndefined();
  expect(session.step).toBe('main');
});

