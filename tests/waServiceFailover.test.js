import { jest } from '@jest/globals';
import { EventEmitter } from 'events';

process.env.JWT_SECRET = 'test';

const baileysClient = new EventEmitter();
baileysClient.connect = jest.fn(
  () => new Promise((resolve) => baileysClient.once('ready', resolve)),
);
baileysClient.disconnect = jest.fn().mockResolvedValue();
baileysClient.sendMessage = jest.fn().mockResolvedValue();
baileysClient.isReady = jest.fn().mockResolvedValue(true);
baileysClient.onDisconnect = jest.fn((handler) => baileysClient.on('disconnected', handler));

jest.unstable_mockModule('../src/service/waAdapter.js', () => ({
  createWWebClient: jest.fn(() => {
    throw new Error('wweb fail');
  }),
  createBaileysClient: jest.fn(() => baileysClient),
}));

test('fallback to Baileys when wweb client fails', async () => {
  const waServicePromise = import('../src/service/waService.js');
  const waHelperPromise = import('../src/utils/waHelper.js');
  const adapterPromise = import('../src/service/waAdapter.js');

  // Emit ready on next tick so waService can attach listeners
  setTimeout(() => baileysClient.emit('ready'), 0);

  const waService = await waServicePromise;
  const waHelper = await waHelperPromise;
  const adapter = await adapterPromise;

  const { default: waClient } = waService;
  const { safeSendMessage } = waHelper;
  const { createWwebClient, createBaileysClient } = adapter;


  await safeSendMessage(waClient, '123@c.us', 'hello');
  expect(createWWebClient).toHaveBeenCalled();
  expect(createBaileysClient).toHaveBeenCalled();
  expect(baileysClient._originalSendMessage).toHaveBeenCalledWith(
    '123@c.us',
    'hello',
    {},
  );
});
