import fs from 'fs/promises';
import path from 'path';

async function deleteFilesByNumber(dir, number) {
  let deleted = 0;
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        deleted += await deleteFilesByNumber(fullPath, number);
        const remaining = await fs.readdir(fullPath).catch(() => []);
        if (!remaining.length) {
          await fs.rmdir(fullPath).catch(() => {});
        }
      } else if (entry.isFile()) {
        if (entry.name.includes(number)) {
          await fs.unlink(fullPath).catch(() => {});
          deleted++;
          continue;
        }
        const content = await fs.readFile(fullPath, 'utf8').catch(() => '');
        if (content.includes(number)) {
          await fs.unlink(fullPath).catch(() => {});
          deleted++;
        }
      }
    }
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
  return deleted;
}

async function deleteFilesByPatterns(dir, patterns) {
  let deleted = 0;
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        deleted += await deleteFilesByPatterns(fullPath, patterns);
        const remaining = await fs.readdir(fullPath).catch(() => []);
        if (!remaining.length) {
          await fs.rmdir(fullPath).catch(() => {});
        }
      } else if (entry.isFile()) {
        if (patterns.some(p => entry.name.includes(p))) {
          await fs.unlink(fullPath).catch(() => {});
          deleted++;
        }
      }
    }
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
  return deleted;
}

export async function deleteBaileysFilesByNumber(number) {
  const sessionsDir = path.join('sessions', 'baileys');
  return deleteFilesByNumber(sessionsDir, number);
}

export async function clearBaileysAuthFiles() {
  const sessionsDir = path.join('sessions', 'baileys');
  const patterns = ['sender-key', 'session', 'pre-key'];
  return deleteFilesByPatterns(sessionsDir, patterns);
}

export async function clearAllBaileysSessions() {
  const sessionsDir = path.join('sessions', 'baileys');
  await fs.rm(sessionsDir, { recursive: true, force: true });
}
