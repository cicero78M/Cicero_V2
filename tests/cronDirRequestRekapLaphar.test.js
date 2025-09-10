import { jest } from '@jest/globals';
import path from 'path';

const mockLapharDitbinmas = jest.fn();
const mockAbsensiLikes = jest.fn();
const mockSendWAFile = jest.fn();
const mockSafeSendMessage = jest.fn();
const mockSendDebug = jest.fn();
const mockWriteFile = jest.fn();
const mockMkdir = jest.fn();
const mockGetAdminWAIds = jest.fn();

jest.unstable_mockModule('../src/service/waService.js', () => ({ default: {} }));
jest.unstable_mockModule('../src/handler/fetchabsensi/insta/absensiLikesInsta.js', () => ({
  lapharDitbinmas: mockLapharDitbinmas,
  absensiLikes: mockAbsensiLikes,
}));
jest.unstable_mockModule('../src/utils/waHelper.js', () => ({
  sendWAFile: mockSendWAFile,
  safeSendMessage: mockSafeSendMessage,
  getAdminWAIds: mockGetAdminWAIds,
}));
jest.unstable_mockModule('../src/middleware/debugHandler.js', () => ({
  sendDebug: mockSendDebug,
}));
jest.unstable_mockModule('fs/promises', () => ({ writeFile: mockWriteFile, mkdir: mockMkdir }));

let runCron;

beforeAll(async () => {
  ({ runCron } = await import('../src/cron/cronDirRequestRekapLaphar.js'));
});

beforeEach(() => {
  jest.clearAllMocks();
  mockGetAdminWAIds.mockReturnValue(['123@c.us']);
  mockLapharDitbinmas.mockResolvedValue({
    text: 'text',
    filename: 'file.txt',
    narrative: 'nar',
    textBelum: 'textBelum',
    filenameBelum: 'belum.txt',
  });
  mockAbsensiLikes.mockResolvedValue('absensi');
  mockMkdir.mockResolvedValue();
  mockWriteFile.mockResolvedValue();
});

test('runCron without rekap sends reports to admin and group only', async () => {
  await runCron(false);

  expect(mockMkdir).toHaveBeenCalledWith('laphar', { recursive: true });
  expect(mockWriteFile).toHaveBeenNthCalledWith(
    1,
    path.join('laphar', 'file.txt'),
    expect.any(Buffer)
  );
  expect(mockWriteFile).toHaveBeenNthCalledWith(
    2,
    path.join('laphar', 'belum.txt'),
    expect.any(Buffer)
  );
  expect(mockSafeSendMessage).toHaveBeenCalledWith({}, '123@c.us', 'nar');
  expect(mockSafeSendMessage).toHaveBeenCalledWith(
    {},
    '120363419830216549@g.us',
    'nar'
  );
  expect(mockSafeSendMessage).not.toHaveBeenCalledWith(
    {},
    '6281234560377@c.us',
    'nar'
  );

  expect(mockSendWAFile).not.toHaveBeenCalledWith(
    {},
    expect.any(Buffer),
    'file.txt',
    '6281234560377@c.us',
    'text/plain'
  );
  expect(mockSendWAFile).not.toHaveBeenCalledWith(
    {},
    expect.any(Buffer),
    'belum.txt',
    '6281234560377@c.us',
    'text/plain'
  );

  expect(mockSafeSendMessage).toHaveBeenCalledWith({}, '123@c.us', 'absensi');
  expect(mockSafeSendMessage).toHaveBeenCalledWith(
    {},
    '120363419830216549@g.us',
    'absensi'
  );
  expect(mockSafeSendMessage).not.toHaveBeenCalledWith(
    {},
    '6281234560377@c.us',
    'absensi'
  );
});

test('runCron with rekap sends reports to admin, group, and extra number', async () => {
  await runCron(true);

  expect(mockSafeSendMessage).toHaveBeenCalledWith({}, '123@c.us', 'nar');
  expect(mockSafeSendMessage).toHaveBeenCalledWith(
    {},
    '120363419830216549@g.us',
    'nar'
  );
  expect(mockSafeSendMessage).toHaveBeenCalledWith(
    {},
    '6281234560377@c.us',
    'nar'
  );

  expect(mockSendWAFile).toHaveBeenCalledWith(
    {},
    expect.any(Buffer),
    'file.txt',
    '6281234560377@c.us',
    'text/plain'
  );
  expect(mockSendWAFile).toHaveBeenCalledWith(
    {},
    expect.any(Buffer),
    'belum.txt',
    '6281234560377@c.us',
    'text/plain'
  );

  expect(mockSafeSendMessage).toHaveBeenCalledWith({}, '123@c.us', 'absensi');
  expect(mockSafeSendMessage).toHaveBeenCalledWith(
    {},
    '120363419830216549@g.us',
    'absensi'
  );
  expect(mockSafeSendMessage).toHaveBeenCalledWith(
    {},
    '6281234560377@c.us',
    'absensi'
  );
});

