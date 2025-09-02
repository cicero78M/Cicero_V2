import fs from 'fs/promises';
import path from 'path';
import { deleteBaileysFilesByNumber, clearAllBaileysSessions } from '../src/service/baileysSessionService.js';

test('deleteBaileysFilesByNumber removes files containing number', async () => {
  const sessionsDir = path.join('sessions', 'baileys');
  await fs.mkdir(sessionsDir, { recursive: true });
  const file = path.join(sessionsDir, 'creds-123.json');
  await fs.writeFile(file, '123');
  const deleted = await deleteBaileysFilesByNumber('123');
  expect(deleted).toBe(1);
  await fs.rm(path.join('sessions'), { recursive: true, force: true });
});

test('clearAllBaileysSessions removes the sessions directory', async () => {
  const sessionsDir = path.join('sessions', 'baileys');
  await fs.mkdir(sessionsDir, { recursive: true });
  await fs.writeFile(path.join(sessionsDir, 'dummy.json'), 'data');
  await clearAllBaileysSessions();
  let exists = true;
  try {
    await fs.access(sessionsDir);
  } catch {
    exists = false;
  }
  expect(exists).toBe(false);
  await fs.rm(path.join('sessions'), { recursive: true, force: true });
});
