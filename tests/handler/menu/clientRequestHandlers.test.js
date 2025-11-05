import { jest } from '@jest/globals';

import clientRequestHandlers, {
  normalizeComplaintHandle,
  parseComplaintMessage,
} from '../../../src/handler/menu/clientRequestHandlers.js';

describe('normalizeComplaintHandle', () => {
  it('normalizes plain handles to lowercase with a leading @', () => {
    expect(normalizeComplaintHandle('ExampleUser')).toBe('@exampleuser');
    expect(normalizeComplaintHandle('@ExampleUser')).toBe('@exampleuser');
  });

  it('extracts usernames from Instagram profile URLs', () => {
    expect(
      normalizeComplaintHandle('https://www.instagram.com/Example.User/')
    ).toBe('@example.user');
    expect(
      normalizeComplaintHandle('instagram.com/u/AnotherPerson')
    ).toBe('@anotherperson');
  });

  it('extracts usernames from TikTok profile URLs', () => {
    expect(
      normalizeComplaintHandle('http://tiktok.com/@ExampleUser')
    ).toBe('@exampleuser');
    expect(
      normalizeComplaintHandle('https://www.tiktok.com/@ExampleUser/video/123')
    ).toBe('@exampleuser');
  });

  it('returns an empty string for unsupported URLs', () => {
    expect(normalizeComplaintHandle('https://instagram.com/p/ABC123')).toBe('');
    expect(normalizeComplaintHandle('')).toBe('');
  });
});

describe('parseComplaintMessage', () => {
  it('captures plain usernames correctly', () => {
    const parsed = parseComplaintMessage(
      [
        'Pesan Komplain',
        'NRP : 123',
        'Nama : Example',
        'Username IG : exampleUser',
        'Username Tiktok : @TikTokUser',
      ].join('\n')
    );

    expect(parsed.instagram).toBe('@exampleuser');
    expect(parsed.tiktok).toBe('@tiktokuser');
  });

  it('captures handles shared as profile URLs', () => {
    const parsed = parseComplaintMessage(
      [
        'Pesan Komplain',
        'NRP : 123',
        'Nama : Example',
        'Username IG : https://instagram.com/u/Example.User/',
        'Username Tiktok : https://www.tiktok.com/@AnotherUser',
      ].join('\n')
    );

    expect(parsed.instagram).toBe('@example.user');
    expect(parsed.tiktok).toBe('@anotheruser');
  });
});

describe('kelolaUser mass status option', () => {
  it('shows bulk status choice in the kelola user menu', async () => {
    const session = {};
    const chatId = 'chat-menu';
    const sendMessage = jest.fn().mockResolvedValue();

    await clientRequestHandlers.kelolaUser_choose(session, chatId, '', {
      sendMessage,
    });

    expect(sendMessage).toHaveBeenCalledWith(
      chatId,
      expect.stringContaining('4️⃣ Ubah Status Massal')
    );
    expect(session.step).toBe('kelolaUser_menu');
  });

  it('redirects kelola user option 4 to the bulk status prompt', async () => {
    const session = {};
    const chatId = 'chat-menu';
    const sendMessage = jest.fn().mockResolvedValue();

    await clientRequestHandlers.kelolaUser_menu(session, chatId, '4', {
      sendMessage,
    });

    expect(session.step).toBe('bulkStatus_process');
    expect(sendMessage).toHaveBeenCalledWith(
      chatId,
      expect.stringContaining('Permohonan Penghapusan Data Personil')
    );
  });
});

describe('bulkStatus_process', () => {
  it('updates every listed user and reports summary with reasons', async () => {
    const session = { step: 'bulkStatus_prompt' };
    const chatId = 'chat-1';
    const sendMessage = jest.fn().mockResolvedValue();

    await clientRequestHandlers.bulkStatus_prompt(session, chatId, '', {
      sendMessage,
    });

    expect(session.step).toBe('bulkStatus_process');
    expect(sendMessage).toHaveBeenCalledWith(
      chatId,
      expect.stringContaining('Permohonan Penghapusan Data Personil')
    );

    sendMessage.mockClear();

    const updateUserField = jest.fn(async (userId, field) => {
      if (userId === '75020203' && field === 'status') {
        throw new Error('User tidak ditemukan');
      }
    });

    const requestMessage = [
      'Permohonan Penghapusan Data Personil – Polres Contoh',
      '',
      '1. Asep Sunandar – 75020201 – mutasi',
      '2. Budi Santoso - 75020202 - pensiun',
      '3. Carla Dewi – 75020203 – double data',
    ].join('\n');

    await clientRequestHandlers.bulkStatus_process(
      session,
      chatId,
      requestMessage,
      { sendMessage },
      undefined,
      { updateUserField }
    );

    const statusCalls = updateUserField.mock.calls.filter(
      ([, field]) => field === 'status'
    );
    expect(statusCalls).toHaveLength(3);
    expect(statusCalls.map(([id]) => id)).toEqual([
      '75020201',
      '75020202',
      '75020203',
    ]);

    const whatsappCalls = updateUserField.mock.calls.filter(
      ([, field]) => field === 'whatsapp'
    );
    expect(whatsappCalls).toHaveLength(2);
    expect(whatsappCalls.map(([id]) => id)).toEqual([
      '75020201',
      '75020202',
    ]);

    expect(sendMessage).toHaveBeenCalledTimes(1);
    const summaryMessage = sendMessage.mock.calls[0][1];
    expect(summaryMessage).toContain('✅ Status dinonaktifkan untuk 2 personel');
    expect(summaryMessage).toContain('75020201 (Asep Sunandar) • mutasi');
    expect(summaryMessage).toContain('double data');
    expect(summaryMessage).toContain('User tidak ditemukan');
    expect(session.step).toBe('main');
  });

  it('parses reason-first entries that include the name in parentheses', async () => {
    const session = { step: 'bulkStatus_process' };
    const chatId = 'chat-reason-first';
    const sendMessage = jest.fn().mockResolvedValue();

    const updateUserField = jest.fn().mockResolvedValue();

    const requestMessage = [
      'Permohonan Penghapusan Data Personil - POLRESTABES SURABAYA',
      '',
      '1. MUTASI (AIPTU ERWAN WAHYUDI) • 76070503',
      '2. PENSIUN (AIPTU KANTUN SUTRISNO) – 67030561',
    ].join('\n');

    await clientRequestHandlers.bulkStatus_process(
      session,
      chatId,
      requestMessage,
      { sendMessage },
      undefined,
      { updateUserField }
    );

    const statusCalls = updateUserField.mock.calls.filter(
      ([, field]) => field === 'status'
    );
    expect(statusCalls.map(([id]) => id)).toEqual(['76070503', '67030561']);

    const whatsappCalls = updateUserField.mock.calls.filter(
      ([, field]) => field === 'whatsapp'
    );
    expect(whatsappCalls.map(([id]) => id)).toEqual(['76070503', '67030561']);

    const summaryMessage = sendMessage.mock.calls[0][1];
    expect(summaryMessage).toContain('76070503 (AIPTU ERWAN WAHYUDI) • MUTASI');
    expect(summaryMessage).toContain('67030561 (AIPTU KANTUN SUTRISNO) • PENSIUN');
    expect(session.step).toBe('main');
  });
});

