import { jest } from '@jest/globals';
import { EventEmitter } from 'events';

let safeSendMessage;
let isAdminWhatsApp;
let sendWAFile;

beforeAll(async () => {
  ({ safeSendMessage, isAdminWhatsApp, sendWAFile } = await import('../src/utils/waHelper.js'));
});

test('safeSendMessage waits for client ready', async () => {
  const waClient = new EventEmitter();
  waClient.getState = jest.fn().mockResolvedValue('INITIALIZING');
  waClient.sendMessage = jest.fn().mockResolvedValue();

  const promise = safeSendMessage(waClient, '123@c.us', 'hello');
  await Promise.resolve();
  expect(waClient.sendMessage).not.toHaveBeenCalled();
  waClient.emit('ready');
  await promise;
  expect(waClient.sendMessage).toHaveBeenCalledWith('123@c.us', 'hello', {});
});

test('isAdminWhatsApp recognizes various input formats', () => {
  const original = process.env.ADMIN_WHATSAPP;
  process.env.ADMIN_WHATSAPP = '6281';
  expect(isAdminWhatsApp('6281@c.us')).toBe(true);
  expect(isAdminWhatsApp('6281@s.whatsapp.net')).toBe(true);
  expect(isAdminWhatsApp('+62 81')).toBe(true);
  expect(isAdminWhatsApp('999@c.us')).toBe(false);
  process.env.ADMIN_WHATSAPP = original;
});

test('sendWAFile falls back to onWhatsApp when getNumberId missing', async () => {
  const waClient = {
    onWhatsApp: jest.fn().mockResolvedValue([{ jid: '123@s.whatsapp.net', exists: true }]),
    sendMessage: jest.fn().mockResolvedValue(),
  };
  const buffer = Buffer.from('hello');
  await sendWAFile(waClient, buffer, 'file.txt', '123@c.us', 'text/plain');
  expect(waClient.onWhatsApp).toHaveBeenCalledWith('123@c.us');
  expect(waClient.sendMessage).toHaveBeenCalledWith('123@s.whatsapp.net', {
    document: buffer,
    mimetype: 'text/plain',
    fileName: 'file.txt',
  });
});
