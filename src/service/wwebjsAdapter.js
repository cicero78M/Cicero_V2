import fs from 'fs';
import { rm } from 'fs/promises';
import path from 'path';
import os from 'os';
import { EventEmitter } from 'events';
import pkg from 'whatsapp-web.js';

const DEFAULT_WEB_VERSION_CACHE_URL = '';
const DEFAULT_AUTH_DATA_DIR = 'wwebjs_auth';
const DEFAULT_AUTH_DATA_PARENT_DIR = '.cicero';

function resolveDefaultAuthDataPath() {
  const homeDir = os.homedir?.();
  const baseDir = homeDir || process.cwd();
  return path.resolve(
    path.join(baseDir, DEFAULT_AUTH_DATA_PARENT_DIR, DEFAULT_AUTH_DATA_DIR)
  );
}

function resolveAuthDataPath() {
  const configuredPath = (process.env.WA_AUTH_DATA_PATH || '').trim();
  if (configuredPath) {
    return path.resolve(configuredPath);
  }
  return resolveDefaultAuthDataPath();
}

function shouldClearAuthSession() {
  return process.env.WA_AUTH_CLEAR_SESSION_ON_REINIT === 'true';
}

function buildSessionPath(authDataPath, clientId) {
  return path.join(authDataPath, `session-${clientId}`);
}

function extractVersionString(payload) {
  if (!payload) {
    return null;
  }
  if (typeof payload === 'string') {
    const match = payload.match(/\d+\.\d+(\.\d+)?/);
    return match?.[0] || null;
  }
  if (typeof payload === 'object') {
    const knownKeys = ['version', 'webVersion', 'wa_version', 'waVersion'];
    for (const key of knownKeys) {
      const value = payload[key];
      if (typeof value === 'string') {
        const match = value.match(/\d+\.\d+(\.\d+)?/);
        if (match?.[0]) {
          return match[0];
        }
      }
    }
  }
  return null;
}

async function fetchWebVersionCache(cacheUrl) {
  try {
    const response = await fetch(cacheUrl, { redirect: 'follow' });
    if (!response.ok) {
      console.warn(
        `[WWEBJS] Web version cache fetch failed (${response.status}) for ${cacheUrl}.`
      );
      return null;
    }
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      return await response.json();
    }
    const textPayload = await response.text();
    try {
      return JSON.parse(textPayload);
    } catch {
      return textPayload;
    }
  } catch (err) {
    console.warn(
      `[WWEBJS] Web version cache fetch error for ${cacheUrl}:`,
      err?.message || err
    );
    return null;
  }
}

async function resolveWebVersionOptions() {
  const cacheUrl =
    (process.env.WA_WEB_VERSION_CACHE_URL || DEFAULT_WEB_VERSION_CACHE_URL).trim();
  const pinnedVersionInput = (process.env.WA_WEB_VERSION || '').trim();
  const pinnedVersion = pinnedVersionInput
    ? extractVersionString(pinnedVersionInput)
    : null;
  const versionOptions = {};

  if (pinnedVersionInput && !pinnedVersion) {
    throw new Error(
      `[WWEBJS] WA_WEB_VERSION must be a valid version string (got "${pinnedVersionInput}").`
    );
  }

  if (cacheUrl) {
    const cachePayload = await fetchWebVersionCache(cacheUrl);
    const extractedVersion = extractVersionString(cachePayload);
    if (extractedVersion) {
      versionOptions.webVersionCache = { type: 'remote', remotePath: cacheUrl };
      if (!pinnedVersion) {
        versionOptions.webVersion = extractedVersion;
      }
    } else {
      console.warn(
        `[WWEBJS] Web version cache validation failed for ${cacheUrl}. ` +
          'Omitting webVersionCache so whatsapp-web.js falls back to defaults.'
      );
    }
  }

  if (pinnedVersion) {
    versionOptions.webVersion = pinnedVersion;
  }

  if ('webVersion' in versionOptions && !versionOptions.webVersion) {
    throw new Error('[WWEBJS] Resolved webVersion is empty; aborting initialization.');
  }

  return versionOptions;
}

const { Client, LocalAuth, MessageMedia } = pkg;

/**
 * Create a whatsapp-web.js client that matches the WAAdapter contract.
 * The client stays in standby mode and does not mark messages as read
 * unless explicitly invoked.
 *
 * @param {string} [clientId='wa-admin'] - WhatsApp client identifier used by LocalAuth.
 */
export async function createWwebjsClient(clientId = 'wa-admin') {
  const emitter = new EventEmitter();
  const configuredAuthPath = (process.env.WA_AUTH_DATA_PATH || '').trim();
  const recommendedAuthPath = resolveDefaultAuthDataPath();
  let authDataPath = resolveAuthDataPath();
  const clearAuthSession = shouldClearAuthSession();
  const ensureAuthDataPathWritable = async (candidatePath, isConfiguredPath) => {
    try {
      await fs.promises.mkdir(candidatePath, { recursive: true });
      await fs.promises.access(candidatePath, fs.constants.W_OK);
      return true;
    } catch (err) {
      if (isConfiguredPath) {
        console.error(
          `[WWEBJS] WA_AUTH_DATA_PATH must be writable by the runtime user. ` +
            `Failed to access ${candidatePath}. Recommended path: ${recommendedAuthPath}.`,
          err?.message || err
        );
      } else {
        console.error(
          `[WWEBJS] Auth data path must be writable by the runtime user. ` +
            `Failed to access ${candidatePath}.`,
          err?.message || err
        );
      }
      return false;
    }
  };
  const authPathWritable = await ensureAuthDataPathWritable(
    authDataPath,
    Boolean(configuredAuthPath)
  );
  if (!authPathWritable) {
    if (configuredAuthPath) {
      throw new Error(
        `[WWEBJS] WA_AUTH_DATA_PATH is not writable: ${authDataPath}. ` +
          `Set WA_AUTH_DATA_PATH to a writable directory (recommended: ${recommendedAuthPath}).`
      );
    } else {
      throw new Error(
        `[WWEBJS] Auth data path is not writable: ${authDataPath}. ` +
          `Recommended path: ${recommendedAuthPath}.`
      );
    }
  }
  const sessionPath = buildSessionPath(authDataPath, clientId);
  let reinitInProgress = false;
  const webVersionOptions = await resolveWebVersionOptions();
  const client = new Client({
    authStrategy: new LocalAuth({ clientId, dataPath: authDataPath }),
    puppeteer: { args: ['--no-sandbox'], headless: true },
    ...webVersionOptions,
  });

  const reinitializeClient = async (trigger, reason) => {
    if (reinitInProgress) {
      console.warn(
        `[WWEBJS] Reinit already in progress for clientId=${clientId}, skipping ${trigger}.`
      );
      return;
    }
    reinitInProgress = true;
    console.warn(
      `[WWEBJS] Reinitializing clientId=${clientId} after ${trigger}${
        reason ? ` (${reason})` : ''
      }.`
    );
    try {
      await client.destroy();
    } catch (err) {
      console.warn(
        `[WWEBJS] destroy failed for clientId=${clientId}:`,
        err?.message || err
      );
    }

    if (clearAuthSession) {
      try {
        await rm(sessionPath, { recursive: true, force: true });
        console.warn(
          `[WWEBJS] Cleared auth session for clientId=${clientId} at ${sessionPath}.`
        );
      } catch (err) {
        console.warn(
          `[WWEBJS] Failed to clear auth session for clientId=${clientId}:`,
          err?.message || err
        );
      }
    }

    try {
      await client.initialize();
    } catch (err) {
      console.error(
        `[WWEBJS] Reinitialize failed for clientId=${clientId}:`,
        err?.message || err
      );
    } finally {
      reinitInProgress = false;
    }
  };

  client.on('qr', (qr) => emitter.emit('qr', qr));
  client.on('ready', async () => {
    try {
      if (!client.pupPage) {
        throw new Error('pupPage is not available');
      }
      await client.pupPage.evaluate(() => {
        if (
          window.Store?.WidFactory &&
          !window.Store.WidFactory.toUserWidOrThrow
        ) {
          window.Store.WidFactory.toUserWidOrThrow = (jid) =>
            window.Store.WidFactory.createWid(jid);
        }
      });
    } catch (err) {
      console.warn(
        `[WWEBJS] ready handler setup failed for clientId=${clientId}:`,
        err?.message || err
      );
    } finally {
      emitter.emit('ready');
    }
  });
  client.on('auth_failure', async (message) => {
    console.warn(`[WWEBJS] auth_failure for clientId=${clientId}:`, message);
    await reinitializeClient('auth_failure', message);
  });

  client.on('disconnected', async (reason) => {
    const normalizedReason = String(reason || '').toUpperCase();
    if (normalizedReason === 'LOGGED_OUT') {
      await reinitializeClient('disconnected', reason);
    }
    emitter.emit('disconnected', reason);
  });
  client.on('message', async (msg) => {
    let contactMeta = {};
    try {
      const contact = await msg.getContact();
      contactMeta = {
        contactName: contact?.name || null,
        contactPushname: contact?.pushname || null,
        isMyContact: contact?.isMyContact ?? null,
      };
    } catch (err) {
      contactMeta = { error: err?.message || 'contact_fetch_failed' };
    }
    emitter.emit('message', {
      from: msg.from,
      body: msg.body,
      id: msg.id,
      author: msg.author,
      timestamp: msg.timestamp,
      ...contactMeta,
    });
  });

  emitter.connect = async () => {
    await client.initialize();
  };

  emitter.disconnect = async () => {
    await client.destroy();
  };

  emitter.getNumberId = async (phone) => {
    try {
      return await client.getNumberId(phone);
    } catch (err) {
      console.warn('[WWEBJS] getNumberId failed:', err?.message || err);
      return null;
    }
  };

  emitter.getChat = async (jid) => {
    try {
      return await client.getChatById(jid);
    } catch (err) {
      console.warn('[WWEBJS] getChat failed:', err?.message || err);
      return null;
    }
  };

  emitter.sendMessage = async (jid, content, options = {}) => {
    let message;
    if (
      content &&
      typeof content === 'object' &&
      'document' in content
    ) {
      const media = new MessageMedia(
        content.mimetype || 'application/octet-stream',
        Buffer.from(content.document).toString('base64'),
        content.fileName
      );
      message = await client.sendMessage(jid, media, {
        ...options,
        sendMediaAsDocument: true,
      });
    } else {
      const text = typeof content === 'string' ? content : content.text;
      message = await client.sendMessage(jid, text, options);
    }
    return message.id._serialized || message.id.id || '';
  };

  emitter.onMessage = (handler) => emitter.on('message', handler);
  emitter.onDisconnect = (handler) => emitter.on('disconnected', handler);
  emitter.isReady = async () => client.info !== undefined;
  emitter.getState = async () => {
    try {
      return await client.getState();
    } catch {
      return 'close';
    }
  };

  emitter.sendSeen = async (jid) => {
    try {
      return await client.sendSeen(jid);
    } catch (err) {
      console.warn('[WWEBJS] sendSeen failed:', err?.message || err);
      return false;
    }
  };

  emitter.getContact = async (jid) => {
    try {
      const contact = await client.getContactById(jid);
      return contact;
    } catch (err) {
      console.warn('[WWEBJS] getContact failed:', err?.message || err);
      return null;
    }
  };

  return emitter;
}
