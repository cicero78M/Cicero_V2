import { jest } from '@jest/globals';

const mockAbsensiRegistrasiDashboardDitbinmas = jest.fn();
const mockSafeSendMessage = jest.fn();
const mockFormatNama = jest.fn();
const mockNormalizeUserId = jest.fn();
const mockGetGreeting = jest.fn();
const mockFormatToWhatsAppId = jest.fn();
const mockFormatUserData = jest.fn();
const mockFormatComplaintIssue = jest.fn();
const mockFetchInstagramInfo = jest.fn();
const mockFetchTiktokProfile = jest.fn();

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
  formatUserData: mockFormatUserData,
  formatComplaintIssue: mockFormatComplaintIssue,
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
jest.unstable_mockModule('../src/service/instaRapidService.js', () => ({
  fetchInstagramInfo: mockFetchInstagramInfo,
}));
jest.unstable_mockModule('../src/service/tiktokRapidService.js', () => ({
  fetchTiktokProfile: mockFetchTiktokProfile,
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
  mockFormatUserData.mockReturnValue('```\nMock User\n```');
  mockFormatComplaintIssue.mockImplementation((value) => value.trim());
  mockFetchInstagramInfo.mockResolvedValue({
    follower_count: 1234,
    following_count: 321,
    media_count: 45,
    is_private: false,
  });
  mockFetchTiktokProfile.mockResolvedValue({
    follower_count: 5678,
    following_count: 89,
    like_count: 1011,
    video_count: 12,
    username: 'username',
  });
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
  expect(mockSafeSendMessage).toHaveBeenNthCalledWith(
    1,
    waClient,
    '08123@wa',
    expect.stringContaining('Tautan update data personel')
  );
  expect(mockSafeSendMessage).toHaveBeenNthCalledWith(
    2,
    waClient,
    chatId,
    expect.stringContaining('Ringkasan Respon Komplain')
  );
  expect(waClient.sendMessage).toHaveBeenNthCalledWith(
    1,
    chatId,
    expect.stringContaining('Data Pelapor')
  );
  expect(waClient.sendMessage).toHaveBeenNthCalledWith(
    2,
    chatId,
    expect.stringContaining('Status Akun Sosial Media')
  );
  expect(waClient.sendMessage).toHaveBeenNthCalledWith(
    3,
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
  expect(waClient.sendMessage).toHaveBeenNthCalledWith(
    1,
    chatId,
    expect.stringContaining('Data Pelapor')
  );
  expect(waClient.sendMessage).toHaveBeenNthCalledWith(
    2,
    chatId,
    expect.stringContaining('Status Akun Sosial Media')
  );
  expect(waClient.sendMessage).toHaveBeenNthCalledWith(
    3,
    chatId,
    'Tuliskan ringkasan *kendala* dari pelapor (atau ketik *batal* untuk keluar):'
  );
  expect(session.step).toBe('respondComplaint_issue');
  expect(session.respondComplaint).toMatchObject({
    nrp: '12345',
    user: expect.any(Object),
    accountStatus: expect.objectContaining({ adminMessage: expect.any(String) }),
  });
  expect(mockFetchInstagramInfo).toHaveBeenCalledWith('username');
  expect(mockFetchTiktokProfile).not.toHaveBeenCalled();
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

test('respondComplaint_issue stores formatted complaint issue and prompts for solution', async () => {
  const session = {
    respondComplaint: {
      nrp: '12345',
      user: { nama: 'Nama Lengkap' },
    },
  };
  const chatId = 'admin-chat';
  const waClient = { sendMessage: jest.fn() };
  mockFormatComplaintIssue.mockReturnValue('Formatted Kendala');

  await clientRequestHandlers.respondComplaint_issue(
    session,
    chatId,
    '  Pesan Komplain ...  ',
    waClient
  );

  expect(mockFormatComplaintIssue).toHaveBeenCalledWith('Pesan Komplain ...');
  expect(session.respondComplaint.issue).toBe('Formatted Kendala');
  expect(session.step).toBe('respondComplaint_solution');
  expect(waClient.sendMessage).toHaveBeenCalledWith(
    chatId,
    'Tuliskan *solusi/tindak lanjut* yang akan dikirim ke pelapor (atau ketik *batal* untuk keluar):'
  );
});

