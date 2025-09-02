import fs from 'fs/promises';
import path from 'path';
import { jest } from '@jest/globals';

jest.unstable_mockModule('../src/handler/fetchabsensi/dashboard/absensiRegistrasiDashboardDitbinmas.js', () => ({
  absensiRegistrasiDashboardDitbinmas: jest.fn(),
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

test('deleteBaileysSession_confirm removes files containing number', async () => {
  const sessionsDir = path.join('sessions', 'baileys');
  await fs.mkdir(sessionsDir, { recursive: true });
  const filePath = path.join(sessionsDir, 'creds-test.json');
  await fs.writeFile(filePath, '62812345');
  const waClient = { sendMessage: jest.fn() };
  const session = { target_wa: '62812345', step: 'deleteBaileysSession_confirm' };
  await clientRequestHandlers.deleteBaileysSession_confirm(session, 'chat', 'ya', waClient);
  let exists = true;
  try {
    await fs.access(filePath);
  } catch {
    exists = false;
  }
  expect(exists).toBe(false);
  await fs.rm(path.join('sessions'), { recursive: true, force: true });
});
