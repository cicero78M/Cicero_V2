import { rm } from 'fs/promises';
import path from 'path';
import { EventEmitter } from 'events';
import pkg from 'whatsapp-web.js';

const DEFAULT_WEB_VERSION_CACHE_URL =
  'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/last.json';
const DEFAULT_AUTH_DATA_PATH = '.wwebjs_auth';

function resolveAuthDataPath() {
  const configuredPath = (process.env.WA_AUTH_DATA_PATH || '').trim();
  const authPath = configuredPath || path.join(process.cwd(), DEFAULT_AUTH_DATA_PATH);
  return path.resolve(authPath);
}

function shouldClearAuthSession() {
  return process.env.WA_AUTH_CLEAR_SESSION_ON_REINIT === 'true';
}

function buildSessionPath(authDataPath, clientId) {
  return path.join(authDataPath, `session-${clientId}`);
}

function resolveWebVersionOptions() {
  const cacheUrl =
    process.env.WA_WEB_VERSION_CACHE_URL || DEFAULT_WEB_VERSION_CACHE_URL;
  const pinnedVersion = (process.env.WA_WEB_VERSION || '').trim();

  const versionOptions = {
    webVersionCache: { type: 'remote', remotePath: cacheUrl },
  };

  if (pinnedVersion) {
    versionOptions.webVersion = pinnedVersion;
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
  const authDataPath = resolveAuthDataPath();
  const clearAuthSession = shouldClearAuthSession();
  const sessionPath = buildSessionPath(authDataPath, clientId);
  let reinitInProgress = false;
  const client = new Client({
    authStrategy: new LocalAuth({ clientId, dataPath: authDataPath }),
    puppeteer: { args: ['--no-sandbox'], headless: true },
    ...resolveWebVersionOptions(),
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
