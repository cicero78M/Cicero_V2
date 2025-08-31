import { jest } from '@jest/globals';
import { EventEmitter } from 'events';

process.env.JWT_SECRET = 'test';

const baileysClient = new EventEmitter();
baileysClient.connect = jest.fn().mockResolvedValue();
baileysClient.disconnect = jest.fn().mockResolvedValue();
baileysClient.sendMessage = jest.fn().mockResolvedValue();
baileysClient.isReady = jest.fn().mockResolvedValue(true);
baileysClient.onDisconnect = jest.fn((handler) => baileysClient.on('disconnected', handler));

jest.unstable_mockModule('../src/service/waAdapter.js', () => ({
  createWwebClient: jest.fn(() => {
    throw new Error('wweb fail');
  }),
  createBaileysClient: jest.fn(() => baileysClient),
}));

const waService = await import('../src/service/waService.js');
const waHelper = await import('../src/utils/waHelper.js');
const adapter = await import('../src/service/waAdapter.js');

const { default: waClient } = waService;
const { safeSendMessage } = waHelper;
const { createWwebClient, createBaileysClient } = adapter;

test('fallback to Baileys when wweb client fails', async () => {
  baileysClient.emit('ready');
  await safeSendMessage(waClient, '123@c.us', 'hello');
  expect(createWwebClient).toHaveBeenCalled();
  expect(createBaileysClient).toHaveBeenCalled();
  expect(baileysClient._originalSendMessage).toHaveBeenCalledWith(
    '123@c.us',
    'hello',
    {}
  );
});
