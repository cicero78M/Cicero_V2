import { jest } from '@jest/globals';
import { EventEmitter } from 'events';

process.env.JWT_SECRET = 'test';

const wwebClient = new EventEmitter();
wwebClient.connect = jest.fn(
  () => new Promise((resolve) => wwebClient.once('ready', resolve)),
);
wwebClient.disconnect = jest.fn().mockResolvedValue();
wwebClient.sendMessage = jest.fn().mockResolvedValue();
wwebClient.isReady = jest.fn().mockResolvedValue(true);
wwebClient.onDisconnect = jest.fn((handler) => wwebClient.on('disconnected', handler));

jest.unstable_mockModule('../src/service/waAdapter.js', () => ({
  createBaileysClient: jest.fn(() => {
    throw new Error('baileys fail');
  }),
  createWWebClient: jest.fn(() => wwebClient),
}));

test('fallback to wweb when Baileys client fails', async () => {
  const waServicePromise = import('../src/service/waService.js');
  const waHelperPromise = import('../src/utils/waHelper.js');
  const adapterPromise = import('../src/service/waAdapter.js');

  setTimeout(() => wwebClient.emit('ready'), 0);

  const waService = await waServicePromise;
  const waHelper = await waHelperPromise;
  const adapter = await adapterPromise;

  const { default: waClient } = waService;
  const { safeSendMessage } = waHelper;
  const { createBaileysClient, createWWebClient } = adapter;

  await safeSendMessage(waClient, '123@c.us', 'hello');
  expect(createBaileysClient).toHaveBeenCalled();
  expect(createWWebClient).toHaveBeenCalled();
  expect(wwebClient._originalSendMessage).toHaveBeenCalledWith(
    '123@c.us',
    'hello',
    {},
  );
});

