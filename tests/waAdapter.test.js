import { jest } from '@jest/globals';

const listeners = {};
const mockSock = {
  ev: {
    on: jest.fn((event, handler) => {
      listeners[event] = handler;
    }),
  },
  end: jest.fn(),
};

const makeWASocket = jest.fn(() => mockSock);

jest.unstable_mockModule('@whiskeysockets/baileys', () => ({
  __esModule: true,
  default: makeWASocket,
  useMultiFileAuthState: jest
    .fn()
    .mockResolvedValue({ state: {}, saveCreds: jest.fn() }),
  fetchLatestBaileysVersion: jest
    .fn()
    .mockResolvedValue({ version: [0, 0, 0] }),
}));

const fsMock = {
  existsSync: jest.fn().mockReturnValue(true),
  rmSync: jest.fn(),
  mkdirSync: jest.fn(),
};

jest.unstable_mockModule('fs', () => ({ __esModule: true, default: fsMock }));

const { createBaileysClient } = await import(
  '../src/service/waAdapter.js'
);

test('adapter resets and resumes on PreKeyError', async () => {
  const client = await createBaileysClient();
  const onMessage = jest.fn();
  client.onMessage(onMessage);

  const upsertHandler = listeners['messages.upsert'];

  const originalEmit = client.emit.bind(client);
  const preKeyError = new Error('prekey');
  preKeyError.name = 'PreKeyError';
  jest
    .spyOn(client, 'emit')
    .mockImplementationOnce(() => {
      throw preKeyError;
    })
    .mockImplementation((...args) => originalEmit(...args));

  const message = {
    type: 'notify',
    messages: [
      {
        key: { remoteJid: '123@s.whatsapp.net' },
        message: { conversation: 'hi' },
      },
    ],
  };

  upsertHandler(message);

  expect(fsMock.rmSync).toHaveBeenCalledTimes(1);
  expect(makeWASocket).toHaveBeenCalledTimes(2);
  expect(onMessage).toHaveBeenCalledWith({
    from: '123@s.whatsapp.net',
    body: 'hi',
  });
});

