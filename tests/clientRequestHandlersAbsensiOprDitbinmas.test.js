import { jest } from '@jest/globals';

const mockAbsensiRegistrasiDashboardDitbinmas = jest.fn();

jest.unstable_mockModule('../src/handler/fetchabsensi/dashboard/absensiRegistrasiDashboardDitbinmas.js', () => ({
  absensiRegistrasiDashboardDitbinmas: mockAbsensiRegistrasiDashboardDitbinmas,
}));

jest.unstable_mockModule('../src/db/index.js', () => ({ query: jest.fn() }));
jest.unstable_mockModule('../src/service/linkReportExcelService.js', () => ({
  saveLinkReportExcel: jest.fn(),
}));
jest.unstable_mockModule('../src/service/googleContactsService.js', () => ({
  saveContactIfNew: jest.fn(),
}));
jest.unstable_mockModule('../src/utils/waHelper.js', () => ({
  getAdminWANumbers: jest.fn(),
  getAdminWAIds: jest.fn(),
  sendWAFile: jest.fn(),
  formatToWhatsAppId: jest.fn(),
}));
jest.unstable_mockModule('../src/model/linkReportModel.js', () => ({}));
jest.unstable_mockModule('../src/handler/fetchengagement/fetchLikesInstagram.js', () => ({
  handleFetchLikesInstagram: jest.fn(),
}));
jest.unstable_mockModule('../src/handler/fetchabsensi/tiktok/absensiKomentarTiktok.js', () => ({
  absensiKomentar: jest.fn(),
  absensiKomentarTiktokPerKonten: jest.fn(),
}));

process.env.JWT_SECRET = 'test';

let clientRequestHandlers;
beforeAll(async () => {
  ({ clientRequestHandlers } = await import('../src/handler/menu/clientRequestHandlers.js'));
});

test('absensiOprDitbinmas sends report and resets step', async () => {
  mockAbsensiRegistrasiDashboardDitbinmas.mockResolvedValue('msg');
  const session = {};
  const chatId = '123';
  const waClient = { sendMessage: jest.fn() };

  await clientRequestHandlers.absensiOprDitbinmas(session, chatId, '', waClient);

  expect(mockAbsensiRegistrasiDashboardDitbinmas).toHaveBeenCalled();
  expect(waClient.sendMessage).toHaveBeenCalledWith(chatId, 'msg');
  expect(session.step).toBe('main');
});
