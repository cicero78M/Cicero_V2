import fs from 'fs';
import { rm } from 'fs/promises';
import path from 'path';
import os from 'os';
import { EventEmitter } from 'events';
import pkg from 'whatsapp-web.js';

const DEFAULT_WEB_VERSION_CACHE_URL = '';
const DEFAULT_AUTH_DATA_DIR = 'wwebjs_auth';
const DEFAULT_AUTH_DATA_PARENT_DIR = '.cicero';
const WEB_VERSION_PATTERN = /^\d+\.\d+(\.\d+)?$/;
const DEFAULT_BROWSER_LOCK_BACKOFF_MS = 20000;
const DEFAULT_PUPPETEER_PROTOCOL_TIMEOUT_MS = 120000;
const DEFAULT_CONNECT_TIMEOUT_MS = 180000;
const DEFAULT_RUNTIME_TIMEOUT_RETRY_ATTEMPTS = 2;
const DEFAULT_RUNTIME_TIMEOUT_RETRY_BACKOFF_MS = 250;

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

const LOGOUT_DISCONNECT_REASONS = new Set([
  'LOGGED_OUT',
  'UNPAIRED',
  'CONFLICT',
  'UNPAIRED_IDLE',
]);

function resolvePuppeteerExecutablePath() {
  const configuredPath = (
    process.env.WA_PUPPETEER_EXECUTABLE_PATH ||
    process.env.PUPPETEER_EXECUTABLE_PATH ||
    ''
  ).trim();
  return configuredPath || null;
}

function resolveBrowserLockBackoffMs() {
  const configured = Number.parseInt(
    process.env.WA_WWEBJS_BROWSER_LOCK_BACKOFF_MS || '',
    10
  );
  if (Number.isNaN(configured)) {
    return DEFAULT_BROWSER_LOCK_BACKOFF_MS;
  }
  return Math.max(configured, 0);
}

function parseTimeoutEnvValue(rawValue) {
  const configured = Number.parseInt(rawValue || '', 10);
  if (Number.isNaN(configured)) {
    return null;
  }
  return Math.max(configured, 0);
}

function normalizeClientIdEnvSuffix(clientId) {
  if (!clientId) {
    return '';
  }
  return String(clientId)
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();
}

function resolvePuppeteerProtocolTimeoutMs(clientId) {
  const clientSuffix = normalizeClientIdEnvSuffix(clientId);
  if (clientSuffix) {
    const perClientValue = parseTimeoutEnvValue(
      process.env[`WA_WWEBJS_PROTOCOL_TIMEOUT_MS_${clientSuffix}`]
    );
    if (perClientValue !== null) {
      return perClientValue;
    }
  }
  const configured = parseTimeoutEnvValue(
    process.env.WA_WWEBJS_PROTOCOL_TIMEOUT_MS
  );
  if (configured !== null) {
    return configured;
  }
  return DEFAULT_PUPPETEER_PROTOCOL_TIMEOUT_MS;
}

function resolveConnectTimeoutMs() {
  const configured = Number.parseInt(process.env.WA_CONNECT_TIMEOUT_MS || '', 10);
  if (Number.isNaN(configured)) {
    return DEFAULT_CONNECT_TIMEOUT_MS;
  }
  return Math.max(configured, 0);
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
    console.warn(
      `[WWEBJS] WA_WEB_VERSION must be a valid version string (got "${pinnedVersionInput}").`
    );
  }

  if (!cacheUrl && !pinnedVersionInput) {
    console.warn(
      '[WWEBJS] WA_WEB_VERSION and WA_WEB_VERSION_CACHE_URL are empty; ' +
        'disabling local web cache to avoid LocalWebCache.persist errors.'
    );
    versionOptions.webVersionCache = { type: 'none' };
  }

  if (cacheUrl) {
    const cachePayload = await fetchWebVersionCache(cacheUrl);
    if (!cachePayload) {
      console.warn(
        `[WWEBJS] Web version cache disabled because fetch failed for ${cacheUrl}.`
      );
      versionOptions.webVersionCache = { type: 'none' };
    } else {
      const extractedVersion = extractVersionString(cachePayload);
      if (extractedVersion) {
        versionOptions.webVersionCache = { type: 'remote', remotePath: cacheUrl };
        if (!pinnedVersion) {
          versionOptions.webVersion = extractedVersion;
        }
      } else {
        console.warn(
          `[WWEBJS] Web version cache validation failed for ${cacheUrl}. ` +
            'Disabling webVersionCache so whatsapp-web.js falls back to defaults.'
        );
        versionOptions.webVersionCache = { type: 'none' };
      }
    }
  }

  if (pinnedVersion) {
    versionOptions.webVersion = pinnedVersion;
  }

  return {
    ...versionOptions,
    __webVersionMeta: { cacheUrl, pinnedVersionInput },
  };
}

function sanitizeWebVersionOptions(versionOptions) {
  const { __webVersionMeta: webVersionMeta, ...baseOptions } = versionOptions;
  const sanitized = { ...baseOptions };
  if (sanitized.webVersionCache?.type === 'remote' && !sanitized.webVersion) {
    console.warn(
      '[WWEBJS] Web version cache disabled because webVersion is empty. ' +
        'Check WA_WEB_VERSION_CACHE_URL for a valid payload.'
    );
    sanitized.webVersionCache = { type: 'none' };
  }

  const resolvedVersion = sanitized.webVersion;
  const isValidResolvedVersion =
    typeof resolvedVersion === 'string' && WEB_VERSION_PATTERN.test(resolvedVersion);
  const shouldValidate =
    Boolean(webVersionMeta?.pinnedVersionInput) ||
    Boolean(webVersionMeta?.cacheUrl) ||
    sanitized.webVersionCache?.type === 'remote';
  if (shouldValidate && !isValidResolvedVersion) {
    const details = [];
    if (webVersionMeta?.pinnedVersionInput) {
      details.push(`WA_WEB_VERSION="${webVersionMeta.pinnedVersionInput}"`);
    }
    if (webVersionMeta?.cacheUrl) {
      details.push(`WA_WEB_VERSION_CACHE_URL="${webVersionMeta.cacheUrl}"`);
    }
    const metaDetails = details.length ? ` (${details.join(', ')})` : '';
    const reason = resolvedVersion
      ? `Invalid resolved webVersion "${resolvedVersion}"`
      : 'Resolved webVersion is missing';
    console.warn(
      `[WWEBJS] ${reason}${metaDetails}. ` +
        'Disabling webVersionCache so whatsapp-web.js falls back to defaults.'
    );
    sanitized.webVersionCache = { type: 'none' };
    delete sanitized.webVersion;
  }
  if ('webVersion' in sanitized && !sanitized.webVersion) {
    delete sanitized.webVersion;
  }
  return sanitized;
}

const { Client, LocalAuth, MessageMedia } = pkg;
const WEB_VERSION_FALLBACK_ERRORS = [
  'LocalWebCache.persist',
  "Cannot read properties of null (reading '1')",
];
const BROWSER_ALREADY_RUNNING_ERROR = 'browser is already running for';
const MISSING_CHROME_ERROR_PATTERNS = [
  /could not find chrome/i,
  /could not find browser executable/i,
];

function shouldFallbackWebVersion(err) {
  const errorDetails = [err?.stack, err?.message].filter(Boolean).join(' ');
  return WEB_VERSION_FALLBACK_ERRORS.some((needle) =>
    errorDetails.includes(needle)
  );
}

function isBrowserAlreadyRunningError(err) {
  const errorDetails = [err?.stack, err?.message]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return errorDetails.includes(BROWSER_ALREADY_RUNNING_ERROR);
}

function isMissingChromeError(err) {
  const errorDetails = [err?.stack, err?.message].filter(Boolean).join(' ');
  return MISSING_CHROME_ERROR_PATTERNS.some((pattern) =>
    pattern.test(errorDetails)
  );
}

function delay(durationMs) {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}

function isRuntimeCallTimeout(err) {
  const errorDetails = [err?.stack, err?.message].filter(Boolean).join(' ');
  return errorDetails.includes('Runtime.callFunctionOn timed out');
}

async function withRuntimeTimeoutRetry(action, label) {
  let lastError = null;
  for (let attempt = 1; attempt <= DEFAULT_RUNTIME_TIMEOUT_RETRY_ATTEMPTS; attempt += 1) {
    try {
      return await action();
    } catch (err) {
      lastError = err;
      if (!isRuntimeCallTimeout(err) || attempt >= DEFAULT_RUNTIME_TIMEOUT_RETRY_ATTEMPTS) {
        throw err;
      }
      const backoffMs = DEFAULT_RUNTIME_TIMEOUT_RETRY_BACKOFF_MS * attempt;
      console.warn(
        `[WWEBJS] ${label} timed out (Runtime.callFunctionOn). ` +
          `Retrying in ${backoffMs}ms (attempt ${attempt}/${DEFAULT_RUNTIME_TIMEOUT_RETRY_ATTEMPTS}).`,
        err?.message || err
      );
      await delay(backoffMs);
    }
  }
  throw lastError;
}

/**
 * Create a whatsapp-web.js client that matches the WAAdapter contract.
 * The client stays in standby mode and does not mark messages as read
 * unless explicitly invoked.
 *
 * @param {string} [clientId='wa-admin'] - WhatsApp client identifier used by LocalAuth.
 */
export async function createWwebjsClient(clientId = 'wa-admin') {
  const emitter = new EventEmitter();
  emitter.fatalInitError = null;
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
  let authPathWritable = await ensureAuthDataPathWritable(
    authDataPath,
    Boolean(configuredAuthPath)
  );
  if (!authPathWritable && configuredAuthPath) {
    console.warn(
      `[WWEBJS] Falling back to recommended auth path ${recommendedAuthPath} ` +
        `because WA_AUTH_DATA_PATH is not writable.`
    );
    authDataPath = recommendedAuthPath;
    authPathWritable = await ensureAuthDataPathWritable(authDataPath, false);
  }
  if (!authPathWritable) {
    if (configuredAuthPath) {
      throw new Error(
        `[WWEBJS] WA_AUTH_DATA_PATH is not writable: ${configuredAuthPath}. ` +
          `Fallback path is also not writable: ${authDataPath}.`
      );
    }
    throw new Error(
      `[WWEBJS] Auth data path is not writable: ${authDataPath}. ` +
        `Recommended path: ${recommendedAuthPath}.`
    );
  }
  const sessionPath = buildSessionPath(authDataPath, clientId);
  const puppeteerProfilePath = sessionPath;
  let reinitInProgress = false;
  let connectInProgress = null;
  let connectStartedAt = null;
  const webVersionOptions = sanitizeWebVersionOptions(
    await resolveWebVersionOptions()
  );
  const puppeteerExecutablePath = resolvePuppeteerExecutablePath();
  const puppeteerProtocolTimeoutMs = resolvePuppeteerProtocolTimeoutMs(clientId);
  const client = new Client({
    authStrategy: new LocalAuth({ clientId, dataPath: authDataPath }),
    puppeteer: {
      args: ['--no-sandbox'],
      headless: true,
      protocolTimeout: puppeteerProtocolTimeoutMs,
      ...(puppeteerExecutablePath
        ? { executablePath: puppeteerExecutablePath }
        : {}),
    },
    ...webVersionOptions,
  });

  const applyWebVersionFallback = () => {
    client.options.webVersionCache = { type: 'none' };
    delete client.options.webVersion;
  };

  const cleanupPuppeteerLocks = async () => {
    if (!puppeteerProfilePath) {
      return;
    }
    const lockFiles = ['SingletonLock', 'SingletonCookie', 'SingletonSocket'];
    await Promise.all(
      lockFiles.map(async (lockFile) => {
        const lockPath = path.join(puppeteerProfilePath, lockFile);
        try {
          await rm(lockPath, { force: true });
        } catch (err) {
          console.warn(
            `[WWEBJS] Failed to remove puppeteer lock file for clientId=${clientId}: ${lockPath}`,
            err?.message || err
          );
        }
      })
    );
  };

  const recoverFromBrowserAlreadyRunning = async (triggerLabel, err) => {
    const backoffMs = resolveBrowserLockBackoffMs();
    console.warn(
      `[WWEBJS] Detected browser lock for clientId=${clientId} (${triggerLabel}). ` +
        `Waiting ${backoffMs}ms before retry to avoid hammering userDataDir.`,
      err?.message || err
    );
    const hasActivePuppeteer = Boolean(client.pupBrowser || client.pupPage);
    if (!hasActivePuppeteer) {
      console.debug(
        `[WWEBJS] Skipping destroy during browser lock recovery for clientId=${clientId} ` +
          'because Puppeteer is not initialized.'
      );
    } else {
      try {
        await client.destroy();
      } catch (destroyErr) {
        console.warn(
          `[WWEBJS] destroy failed during browser lock recovery for clientId=${clientId}:`,
          destroyErr?.message || destroyErr
        );
      }
    }
    await cleanupPuppeteerLocks();
    if (backoffMs > 0) {
      await delay(backoffMs);
    }
  };

  const initializeClientWithFallback = async (triggerLabel) => {
    emitter.fatalInitError = null;
    try {
      await client.initialize();
    } catch (err) {
      if (isMissingChromeError(err)) {
        const taggedError =
          err instanceof Error ? err : new Error(err?.message || String(err));
        taggedError.isMissingChromeError = true;
        emitter.fatalInitError = {
          type: 'missing-chrome',
          error: taggedError,
        };
        console.error(
          `[WWEBJS] Chrome executable not found for clientId=${clientId} (${triggerLabel}). ` +
            'Set WA_PUPPETEER_EXECUTABLE_PATH or run "npx puppeteer browsers install chrome" ' +
            'to populate the Puppeteer cache.',
          err?.message || err
        );
        throw taggedError;
      }
      if (isBrowserAlreadyRunningError(err)) {
        await recoverFromBrowserAlreadyRunning(triggerLabel, err);
        try {
          await client.initialize();
          return;
        } catch (retryErr) {
          console.error(
            `[WWEBJS] initialize retry failed after browser lock recovery for clientId=${clientId} (${triggerLabel}):`,
            retryErr?.message || retryErr
          );
          throw retryErr;
        }
      }
      if (shouldFallbackWebVersion(err)) {
        console.warn(
          `[WWEBJS] initialize failed for clientId=${clientId} (${triggerLabel}). ` +
            'Applying webVersionCache fallback; check WA_WEB_VERSION_CACHE_URL and/or WA_WEB_VERSION.',
          err?.message || err
        );
        applyWebVersionFallback();
        try {
          await client.initialize();
          return;
        } catch (retryErr) {
          console.error(
            `[WWEBJS] initialize retry failed for clientId=${clientId} (${triggerLabel}):`,
            retryErr?.message || retryErr
          );
          throw retryErr;
        }
      }
      console.error(
        `[WWEBJS] initialize failed for clientId=${clientId} (${triggerLabel}):`,
        err?.message || err
      );
      throw err;
    }
  };

  const initializeClientWithTimeout = (triggerLabel) => {
    const timeoutMs = resolveConnectTimeoutMs();
    if (timeoutMs <= 0) {
      return initializeClientWithFallback(triggerLabel);
    }
    let timeoutId;
    return new Promise((resolve, reject) => {
      timeoutId = setTimeout(() => {
        connectInProgress = null;
        connectStartedAt = null;
        const error = new Error(
          `[WWEBJS] connect timeout after ${timeoutMs}ms for clientId=${clientId} (${triggerLabel}).`
        );
        error.code = 'WA_CONNECT_TIMEOUT';
        console.error(
          `[WWEBJS] Koneksi macet (timeout ${timeoutMs}ms) untuk clientId=${clientId} (${triggerLabel}). ` +
            'Menandai connect sebagai gagal agar reinit bisa berjalan.'
        );
        reject(error);
      }, timeoutMs);
      initializeClientWithFallback(triggerLabel)
        .then(resolve)
        .catch(reject)
        .finally(() => clearTimeout(timeoutId));
    });
  };

  const startConnect = (triggerLabel) => {
    if (connectInProgress) {
      return connectInProgress;
    }
    connectStartedAt = Date.now();
    connectInProgress = initializeClientWithTimeout(triggerLabel).finally(() => {
      connectInProgress = null;
      connectStartedAt = null;
    });
    return connectInProgress;
  };

  const reinitializeClient = async (trigger, reason, options = {}) => {
    if (reinitInProgress) {
      console.warn(
        `[WWEBJS] Reinit already in progress for clientId=${clientId}, skipping ${trigger}.`
      );
      return;
    }
    if (connectInProgress) {
      console.warn(
        `[WWEBJS] Reinit waiting for in-flight connect for clientId=${clientId} (${trigger}).`
      );
      try {
        await connectInProgress;
      } catch (err) {
        console.warn(
          `[WWEBJS] In-flight connect failed before reinit for clientId=${clientId}:`,
          err?.message || err
        );
      }
    }
    const shouldClearSession =
      options?.clearAuthSessionOverride ?? clearAuthSession;
    const clearSessionLabel = shouldClearSession ? ' (clear session)' : '';
    reinitInProgress = true;
    console.warn(
      `[WWEBJS] Reinitializing clientId=${clientId} after ${trigger}${
        reason ? ` (${reason})` : ''
      }${clearSessionLabel}.`
    );
    try {
      await client.destroy();
    } catch (err) {
      console.warn(
        `[WWEBJS] destroy failed for clientId=${clientId}:`,
        err?.message || err
      );
    }

    if (shouldClearSession) {
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
      await startConnect(`reinitialize:${trigger}`);
    } finally {
      reinitInProgress = false;
    }
  };

  client.on('qr', (qr) => emitter.emit('qr', qr));
  const ensureWidFactory = async (contextLabel) => {
    if (!client.pupPage) {
      if (client.info?.wid) {
        return true;
      }
      console.warn(
        `[WWEBJS] ${contextLabel} skipped: WidFactory belum tersedia karena pupPage belum siap.`
      );
      return false;
    }
    try {
      const hasWidFactory = await client.pupPage.evaluate(() => {
        if (!window.Store?.WidFactory) {
          return false;
        }
        if (!window.Store.WidFactory.toUserWidOrThrow) {
          window.Store.WidFactory.toUserWidOrThrow = (jid) =>
            window.Store.WidFactory.createWid(jid);
        }
        return true;
      });
      if (!hasWidFactory) {
        console.warn(
          `[WWEBJS] ${contextLabel} skipped: WidFactory belum tersedia di window.Store.`
        );
      }
      return hasWidFactory;
    } catch (err) {
      console.warn(
        `[WWEBJS] ${contextLabel} WidFactory check failed:`,
        err?.message || err
      );
      return false;
    }
  };
  client.on('ready', async () => {
    try {
      await ensureWidFactory(`ready handler for clientId=${clientId}`);
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
    if (LOGOUT_DISCONNECT_REASONS.has(normalizedReason)) {
      await reinitializeClient('disconnected', reason, {
        clearAuthSessionOverride: true,
      });
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

  emitter.connect = async () => startConnect('connect');
  emitter.reinitialize = async (options = {}) => {
    const safeOptions = options && typeof options === 'object' ? options : {};
    const hasClearAuthSession =
      typeof safeOptions.clearAuthSession === 'boolean';
    const clearAuthSessionOverride = hasClearAuthSession
      ? safeOptions.clearAuthSession
      : undefined;
    const reason = safeOptions.reason || null;
    const trigger = safeOptions.trigger || 'manual';
    return reinitializeClient(trigger, reason, { clearAuthSessionOverride });
  };

  emitter.disconnect = async () => {
    await client.destroy();
  };

  emitter.getNumberId = async (phone) => {
    const widReady = await ensureWidFactory('getNumberId');
    if (!widReady) {
      return null;
    }
    try {
      return await withRuntimeTimeoutRetry(
        () => client.getNumberId(phone),
        'getNumberId'
      );
    } catch (err) {
      console.warn('[WWEBJS] getNumberId failed:', err?.message || err);
      return null;
    }
  };

  emitter.getChat = async (jid) => {
    try {
      return await withRuntimeTimeoutRetry(
        () => client.getChatById(jid),
        'getChat'
      );
    } catch (err) {
      console.warn('[WWEBJS] getChat failed:', err?.message || err);
      return null;
    }
  };

  emitter.sendMessage = async (jid, content, options = {}) => {
    const safeOptions = options && typeof options === 'object' ? options : {};
    const normalizedOptions = { sendSeen: false, ...safeOptions };
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
        ...normalizedOptions,
        sendMediaAsDocument: true,
      });
    } else {
      const text =
        typeof content === 'string' ? content : content?.text ?? '';
      message = await client.sendMessage(jid, text, normalizedOptions);
    }
    return message.id._serialized || message.id.id || '';
  };

  emitter.onMessage = (handler) => emitter.on('message', handler);
  emitter.onDisconnect = (handler) => emitter.on('disconnected', handler);
  emitter.isReady = async () => client.info !== undefined;
  emitter.getConnectPromise = () => connectInProgress;
  emitter.getConnectStartedAt = () => connectStartedAt;
  emitter.getState = async () => {
    try {
      const state = await client.getState();
      if (state === null || state === undefined) {
        return 'unknown';
      }
      return state;
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
      const contact = await withRuntimeTimeoutRetry(
        () => client.getContactById(jid),
        'getContact'
      );
      return contact;
    } catch (err) {
      console.warn('[WWEBJS] getContact failed:', err?.message || err);
      return null;
    }
  };

  emitter.clientId = clientId;
  emitter.sessionPath = sessionPath;

  return emitter;
}
