import { jest } from '@jest/globals';

process.env.TZ = 'Asia/Jakarta';

const mockGetUsersSocialByClient = jest.fn();
const mockAbsensiLink = jest.fn();
const mockAbsensiLikes = jest.fn();
const mockAbsensiKomentarInstagram = jest.fn();
const mockAbsensiKomentar = jest.fn();
const mockFindClientById = jest.fn();

jest.unstable_mockModule('../src/model/userModel.js', () => ({
  getUsersSocialByClient: mockGetUsersSocialByClient,
}));

jest.unstable_mockModule(
  '../src/handler/fetchabsensi/link/absensiLinkAmplifikasi.js',
  () => ({ absensiLink: mockAbsensiLink })
);

jest.unstable_mockModule(
  '../src/handler/fetchabsensi/insta/absensiLikesInsta.js',
  () => ({ absensiLikes: mockAbsensiLikes })
);

jest.unstable_mockModule(
  '../src/handler/fetchabsensi/insta/absensiKomentarInstagram.js',
  () => ({ absensiKomentarInstagram: mockAbsensiKomentarInstagram })
);

jest.unstable_mockModule(
  '../src/handler/fetchabsensi/tiktok/absensiKomentarTiktok.js',
  () => ({ absensiKomentar: mockAbsensiKomentar })
);

jest.unstable_mockModule('../src/service/clientService.js', () => ({
  findClientById: mockFindClientById,
}));

let dashRequestHandlers;
beforeAll(async () => {
  const mod = await import('../src/handler/menu/dashRequestHandlers.js');
  dashRequestHandlers = mod.dashRequestHandlers;
});

beforeEach(() => {
  jest.clearAllMocks();
});

test('main sends menu directly when single client', async () => {
  mockFindClientById.mockResolvedValue({ nama: 'Client One' });
  const session = { role: 'user', client_ids: ['C1'] };
  const chatId = '123';
  const waClient = { sendMessage: jest.fn() };

  await dashRequestHandlers.main(session, chatId, '', waClient);

  expect(session.selectedClientId).toBe('C1');
  expect(session.step).toBe('choose_menu');
  expect(waClient.sendMessage).toHaveBeenCalled();
  const message = waClient.sendMessage.mock.calls[0][1];
  expect(message).toContain('Client: *Client One*');
});

test('main lists clients when multiple', async () => {
  mockFindClientById
    .mockResolvedValueOnce({ nama: 'Client One' })
    .mockResolvedValueOnce({ nama: 'Client Two' });
  const session = { role: 'user', client_ids: ['C1', 'C2'] };
  const waClient = { sendMessage: jest.fn() };
  const chatId = '123';

  await dashRequestHandlers.main(session, chatId, '', waClient);

  expect(session.step).toBe('choose_client');
  const msg = waClient.sendMessage.mock.calls[0][1];
  expect(msg).toContain('1. Client One');
  expect(msg).toContain('2. Client Two');
});

test('choose_client selects client and shows menu', async () => {
  mockFindClientById
    .mockResolvedValueOnce({ nama: 'Client One' })
    .mockResolvedValueOnce({ nama: 'Client Two' })
    .mockResolvedValueOnce({ nama: 'Client Two' });
  const session = { role: 'user', client_ids: ['C1', 'C2'] };
  const waClient = { sendMessage: jest.fn() };
  const chatId = '123';

  await dashRequestHandlers.main(session, chatId, '', waClient);
  waClient.sendMessage.mockClear();

  await dashRequestHandlers.choose_client(session, chatId, '2', waClient);

  expect(session.selectedClientId).toBe('C2');
  expect(session.step).toBe('choose_menu');
  const msg = waClient.sendMessage.mock.calls[0][1];
  expect(msg).toContain('Client: *Client Two*');
});

test('choose_menu uses selected client id', async () => {
  mockGetUsersSocialByClient.mockResolvedValue([]);
  mockFindClientById.mockResolvedValue({});
  const session = {
    role: 'user',
    selectedClientId: 'C1',
    clientName: 'Client One',
  };
  const waClient = { sendMessage: jest.fn() };
  const chatId = '123';

  await dashRequestHandlers.choose_menu(session, chatId, '1', waClient);

  expect(mockGetUsersSocialByClient).toHaveBeenCalledWith('C1');
});

test('choose_dash_user lists and selects dashboard user', async () => {
  mockFindClientById
    .mockResolvedValueOnce({ nama: 'Client One' })
    .mockResolvedValueOnce({ nama: 'Client Two' })
    .mockResolvedValueOnce({ nama: 'Client Two' });
  const session = {
    dash_users: [
      { role: 'user', client_ids: ['C1'] },
      { role: 'user', client_ids: ['C2'] },
    ],
  };
  const waClient = { sendMessage: jest.fn() };
  const chatId = '123';

  await dashRequestHandlers.choose_dash_user(session, chatId, '', waClient);
  expect(waClient.sendMessage).toHaveBeenCalled();
  const listMsg = waClient.sendMessage.mock.calls[0][1];
  expect(listMsg).toContain('1. Client One');
  expect(listMsg).toContain('2. Client Two');

  waClient.sendMessage.mockClear();
  const mainSpy = jest
    .spyOn(dashRequestHandlers, 'main')
    .mockResolvedValue();
  await dashRequestHandlers.choose_dash_user(session, chatId, '2', waClient);
  expect(session.role).toBe('user');
  expect(session.client_ids).toEqual(['C2']);
  expect(mainSpy).toHaveBeenCalled();
  mainSpy.mockRestore();
});

test('choose_menu formats directorate report header', async () => {
  mockGetUsersSocialByClient.mockReset();
  mockFindClientById.mockReset();

  jest.useFakeTimers();
  jest.setSystemTime(new Date('2025-08-20T14:28:00Z'));

  mockGetUsersSocialByClient.mockResolvedValue([]);
  mockFindClientById.mockResolvedValue({
    nama: 'DIREKTORAT BINMAS',
    client_type: 'direktorat',
  });

  const session = {
    role: 'user',
    selectedClientId: 'BINMAS',
    clientName: 'DIREKTORAT BINMAS',
  };
  const waClient = { sendMessage: jest.fn() };
  const chatId = '123';

  await dashRequestHandlers.choose_menu(session, chatId, '1', waClient);

  const msg = waClient.sendMessage.mock.calls[0][1];
  expect(msg).toBe(
    'Selamat siang,\n\nMohon ijin Komandan, Melaporkan absensi update data personil DIREKTORAT BINMAS, pada Hari Rabu, Tanggal 20 Agustus 2025, jam 14.28 Wib, sebagai berikut :'
  );

  jest.useRealTimers();
});

