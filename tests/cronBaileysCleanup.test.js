import fs from 'fs/promises';
import path from 'path';
import { jest } from '@jest/globals';

let scheduledCleanup;
const schedule = jest.fn((expr, fn) => {
  scheduledCleanup = fn;
});

jest.unstable_mockModule('node-cron', () => ({ default: { schedule } }));

const waClient = { getState: jest.fn() };
jest.unstable_mockModule('../src/service/waService.js', () => ({ waClient }));

await import('../src/cron/cronBaileysCleanup.js');

const SAFE_AGE_MS = 24 * 60 * 60 * 1000;

test('skips cleanup when Baileys socket is connected', async () => {
  const sessionsDir = path.join('sessions', 'baileys');
  await fs.mkdir(sessionsDir, { recursive: true });
  const filePath = path.join(sessionsDir, 'session-test.json');
  await fs.writeFile(filePath, '');

  waClient.getState.mockResolvedValue('open');
  await scheduledCleanup();

  let exists = true;
  try {
    await fs.access(filePath);
  } catch {
    exists = false;
  }
  expect(exists).toBe(true);
  await fs.rm('sessions', { recursive: true, force: true });
});

test('deletes only auth files older than 24 hours', async () => {
  const sessionsDir = path.join('sessions', 'baileys');
  await fs.mkdir(sessionsDir, { recursive: true });
  const oldFile = path.join(sessionsDir, 'session-old.json');
  const newFile = path.join(sessionsDir, 'session-new.json');
  await fs.writeFile(oldFile, '');
  await fs.writeFile(newFile, '');
  const past = Date.now() - SAFE_AGE_MS - 3600000; // 1h older than safe age
  const pastDate = new Date(past);
  await fs.utimes(oldFile, pastDate, pastDate);

  waClient.getState.mockResolvedValue('close');
  await scheduledCleanup();

  let existsOld = true;
  try {
    await fs.access(oldFile);
  } catch {
    existsOld = false;
  }
  let existsNew = true;
  try {
    await fs.access(newFile);
  } catch {
    existsNew = false;
  }
  expect(existsOld).toBe(false);
  expect(existsNew).toBe(true);
  await fs.rm('sessions', { recursive: true, force: true });
});
