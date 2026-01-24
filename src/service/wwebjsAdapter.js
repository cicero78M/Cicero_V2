import fs from 'fs';
import { rm, readFile, stat } from 'fs/promises';
import path from 'path';
import os from 'os';
import net from 'net';
import { EventEmitter } from 'events';
import pkg from 'whatsapp-web.js';

const DEFAULT_WEB_VERSION_CACHE_URL = '';
const DEFAULT_AUTH_DATA_DIR = 'wwebjs_auth';
const DEFAULT_AUTH_DATA_PARENT_DIR = '.cicero';
const WEB_VERSION_PATTERN = /^\d+\.\d+(\.\d+)?$/;
const DEFAULT_BROWSER_LOCK_BACKOFF_MS = 20000;
const DEFAULT_ACTIVE_BROWSER_LOCK_BACKOFF_MULTIPLIER = 3;
const MIN_ACTIVE_BROWSER_LOCK_BACKOFF_MS = 30000;
const DEFAULT_PUPPETEER_PROTOCOL_TIMEOUT_MS = 120000;
const DEFAULT_PUPPETEER_PROTOCOL_TIMEOUT_MAX_MS = 300000;
const DEFAULT_PROTOCOL_TIMEOUT_BACKOFF_MULTIPLIER = 1.5;
const DEFAULT_CONNECT_TIMEOUT_MS = 180000;
const DEFAULT_CONNECT_RETRY_ATTEMPTS = 3;
const DEFAULT_CONNECT_RETRY_BACKOFF_MS = 5000;
const DEFAULT_CONNECT_RETRY_BACKOFF_MULTIPLIER = 2;
const DEFAULT_RUNTIME_TIMEOUT_RETRY_ATTEMPTS = 2;
const DEFAULT_RUNTIME_TIMEOUT_RETRY_BACKOFF_MS = 250;
const DEFAULT_LOCK_FALLBACK_THRESHOLD = 2;
const COMMON_CHROME_EXECUTABLE_PATHS = [
  '/usr/bin/google-chrome',
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
  '/opt/google/chrome/chrome',
];
const PROTOCOL_TIMEOUT_ENV_VAR_BASE = 'WA_WWEBJS_PROTOCOL_TIMEOUT_MS';
const PROTOCOL_TIMEOUT_ROLE_ALIASES = [
  { prefix: 'wa-gateway', suffix: 'GATEWAY' },
  { prefix: 'wa-user', suffix: 'USER' },
];

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

async function resolvePuppeteerExecutablePath() {
  const configuredPath = (
    process.env.WA_PUPPETEER_EXECUTABLE_PATH ||
    process.env.PUPPETEER_EXECUTABLE_PATH ||
    ''
  ).trim();
  if (configuredPath) {
    const isAccessible = await isExecutableAccessible(configuredPath);
    return isAccessible ? configuredPath : null;
  }
  for (const candidatePath of COMMON_CHROME_EXECUTABLE_PATHS) {
    if (await isExecutableAccessible(candidatePath)) {
      return candidatePath;
    }
  }
  return null;
}

async function isExecutableAccessible(executablePath) {
  if (!executablePath) {
    return false;
  }
  try {
    await fs.promises.access(executablePath, fs.constants.X_OK);
    return true;
  } catch (err) {
    return false;
  }
}

function formatFileMode(mode) {
  if (typeof mode !== 'number') {
    return 'unknown';
  }
  return `0${(mode & 0o777).toString(8)}`;
}

async function getExecutableDiagnostics(executablePath) {
  if (!executablePath) {
    return {
      resolvedPath: null,
      statMode: null,
      statErrorCode: 'ENOENT',
      accessOk: false,
      accessErrorCode: 'ENOENT',
    };
  }
  const resolvedPath = path.resolve(executablePath);
  let statMode = null;
  let statErrorCode = null;
  try {
    const stats = await fs.promises.stat(resolvedPath);
    statMode = stats.mode;
  } catch (err) {
    statErrorCode = err?.code || 'UNKNOWN';
  }
  let accessOk = false;
  let accessErrorCode = null;
  try {
    await fs.promises.access(resolvedPath, fs.constants.X_OK);
    accessOk = true;
  } catch (err) {
    accessErrorCode = err?.code || 'UNKNOWN';
  }
  return {
    resolvedPath,
    statMode,
    statErrorCode,
    accessOk,
    accessErrorCode,
  };
}

function buildExecutableRemediationHints(diagnostics) {
  const hints = [];
  const hasExecuteBit =
    typeof diagnostics?.statMode === 'number' &&
    (diagnostics.statMode & 0o111) !== 0;
  if (typeof diagnostics?.statMode === 'number' && !hasExecuteBit) {
    hints.push('chmod +x <path>');
  }
  if (diagnostics?.accessErrorCode === 'EACCES' && hasExecuteBit) {
    hints.push('mount -o remount,exec <mountpoint>');
  }
  return hints;
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

function resolveActiveBrowserLockBackoffMs() {
  const baseBackoffMs = resolveBrowserLockBackoffMs();
  const scaledBackoffMs =
    baseBackoffMs * DEFAULT_ACTIVE_BROWSER_LOCK_BACKOFF_MULTIPLIER;
  return Math.max(scaledBackoffMs, MIN_ACTIVE_BROWSER_LOCK_BACKOFF_MS);
}

function shouldUseStrictLockRecovery() {
  return process.env.WA_WWEBJS_LOCK_RECOVERY_STRICT === 'true';
}

function parseTimeoutEnvValue(rawValue) {
  const configured = Number.parseInt(rawValue || '', 10);
  if (Number.isNaN(configured)) {
    return null;
  }
  return Math.max(configured, 0);
}

function isProcessRunning(pid) {
  if (!pid) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    if (err?.code === 'ESRCH') {
      return false;
    }
    return false;
  }
}

async function readLockPid(lockPath) {
  try {
    const content = await readFile(lockPath, 'utf8');
    const pid = Number.parseInt(String(content).trim(), 10);
    if (Number.isNaN(pid)) {
      return null;
    }
    return pid;
  } catch (err) {
    if (err?.code === 'ENOENT') {
      return null;
    }
    return null;
  }
}

async function isSingletonSocketActive(socketPath) {
  try {
    const socketStats = await stat(socketPath);
    if (!socketStats.isSocket()) {
      return false;
    }
  } catch (err) {
    if (err?.code === 'ENOENT') {
      return false;
    }
    return false;
  }

  return new Promise((resolve) => {
    const socket = net.createConnection({ path: socketPath });
    const finalize = (result) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(result);
    };

    socket.once('connect', () => finalize(true));
    socket.once('error', (err) => {
      if (err?.code === 'ECONNREFUSED' || err?.code === 'ENOENT') {
        finalize(false);
        return;
      }
      finalize(false);
    });
  });
}

async function detectActiveBrowserLock(profilePath) {
  const lockPath = path.join(profilePath, 'SingletonLock');
  const socketPath = path.join(profilePath, 'SingletonSocket');
  const pid = await readLockPid(lockPath);
  if (pid && isProcessRunning(pid)) {
    return { isActive: true, reason: `pid=${pid}` };
  }
  const socketActive = await isSingletonSocketActive(socketPath);
  if (socketActive) {
    return { isActive: true, reason: 'singleton socket active' };
  }
  return { isActive: false, reason: null };
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

function resolveProtocolTimeoutRoleSuffix(clientId) {
  if (!clientId) {
    return null;
  }
  const normalizedClientId = String(clientId).trim().toLowerCase();
  if (!normalizedClientId) {
    return null;
  }
  const match = PROTOCOL_TIMEOUT_ROLE_ALIASES.find(({ prefix }) =>
    normalizedClientId.startsWith(prefix)
  );
  return match?.suffix || null;
}

function resolveProtocolTimeoutEnvCandidates(clientId) {
  const candidates = [];
  const clientSuffix = normalizeClientIdEnvSuffix(clientId);
  if (clientSuffix) {
    candidates.push(`${PROTOCOL_TIMEOUT_ENV_VAR_BASE}_${clientSuffix}`);
  }
  const roleSuffix = resolveProtocolTimeoutRoleSuffix(clientId);
  if (roleSuffix) {
    candidates.push(`${PROTOCOL_TIMEOUT_ENV_VAR_BASE}_${roleSuffix}`);
  }
  candidates.push(PROTOCOL_TIMEOUT_ENV_VAR_BASE);
  return [...new Set(candidates)];
}

function resolvePuppeteerProtocolTimeoutConfig(clientId) {
  const candidates = resolveProtocolTimeoutEnvCandidates(clientId);
  for (const envVarName of candidates) {
    const configuredValue = parseTimeoutEnvValue(process.env[envVarName]);
    if (configuredValue !== null) {
      return { timeoutMs: configuredValue, envVarName };
    }
  }
  return {
    timeoutMs: DEFAULT_PUPPETEER_PROTOCOL_TIMEOUT_MS,
    envVarName: PROTOCOL_TIMEOUT_ENV_VAR_BASE,
  };
}

function resolveProtocolTimeoutMaxMs() {
  const configured = parseTimeoutEnvValue(
    process.env.WA_WWEBJS_PROTOCOL_TIMEOUT_MAX_MS
  );
  if (configured === null) {
    return DEFAULT_PUPPETEER_PROTOCOL_TIMEOUT_MAX_MS;
  }
  return Math.max(configured, 0);
}

function resolveProtocolTimeoutBackoffMultiplier() {
  const configured = Number.parseFloat(
    process.env.WA_WWEBJS_PROTOCOL_TIMEOUT_BACKOFF_MULTIPLIER || ''
  );
  if (Number.isNaN(configured)) {
    return DEFAULT_PROTOCOL_TIMEOUT_BACKOFF_MULTIPLIER;
  }
  return Math.max(configured, 1);
}

function resolveConnectTimeoutMs() {
  const configured = Number.parseInt(process.env.WA_CONNECT_TIMEOUT_MS || '', 10);
  if (Number.isNaN(configured)) {
    return DEFAULT_CONNECT_TIMEOUT_MS;
  }
  return Math.max(configured, 0);
}

function resolveConnectRetryAttempts() {
  const configured = Number.parseInt(
    process.env.WA_WWEBJS_CONNECT_RETRY_ATTEMPTS || '',
    10
  );
  if (Number.isNaN(configured)) {
    return DEFAULT_CONNECT_RETRY_ATTEMPTS;
  }
  return Math.max(configured, 1);
}

function resolveConnectRetryBackoffMs() {
  const configured = Number.parseInt(
    process.env.WA_WWEBJS_CONNECT_RETRY_BACKOFF_MS || '',
    10
  );
  if (Number.isNaN(configured)) {
    return DEFAULT_CONNECT_RETRY_BACKOFF_MS;
  }
  return Math.max(configured, 0);
}

function resolveConnectRetryBackoffMultiplier() {
  const configured = Number.parseFloat(
    process.env.WA_WWEBJS_CONNECT_RETRY_BACKOFF_MULTIPLIER || ''
  );
  if (Number.isNaN(configured)) {
    return DEFAULT_CONNECT_RETRY_BACKOFF_MULTIPLIER;
  }
  return Math.max(configured, 1);
}

function resolveLockFallbackThreshold() {
  const configured = Number.parseInt(
    process.env.WA_WWEBJS_LOCK_FALLBACK_THRESHOLD || '',
    10
  );
  if (Number.isNaN(configured)) {
    return DEFAULT_LOCK_FALLBACK_THRESHOLD;
  }
  return Math.max(configured, 1);
}

function buildSessionPath(authDataPath, clientId) {
  return path.join(authDataPath, `session-${clientId}`);
}

function resolveFallbackAuthDataPath(authDataPath) {
  const configuredPath = (process.env.WA_WWEBJS_FALLBACK_AUTH_DATA_PATH || '').trim();
  if (configuredPath) {
    return path.resolve(configuredPath);
  }
  return authDataPath;
}

function sanitizePathSegment(value) {
  return String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function buildFallbackAuthDataPath(authDataPath, clientId, attempt) {
  const hostname = sanitizePathSegment(os.hostname());
  const pid = sanitizePathSegment(String(process.pid));
  const envSuffix = sanitizePathSegment(
    (process.env.WA_WWEBJS_FALLBACK_USER_DATA_DIR_SUFFIX || '').trim()
  );
  const suffixParts = [clientId, hostname, pid, `attempt${attempt}`, envSuffix].filter(
    Boolean
  );
  const suffix = sanitizePathSegment(suffixParts.join('_')) || 'fallback';
  const baseName = path.basename(authDataPath);
  const parentDir = path.dirname(authDataPath);
  return path.join(parentDir, `${baseName}-fallback-${suffix}`);
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

function describeSendMessageContentType(content) {
  if (content && typeof content === 'object' && 'document' in content) {
    return 'document';
  }
  if (typeof content === 'string') {
    return 'text';
  }
  if (content && typeof content === 'object' && 'text' in content) {
    return 'text';
  }
  if (content == null) {
    return 'empty';
  }
  return typeof content;
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
  const recommendedVersionInput = (process.env.WA_WEB_VERSION_RECOMMENDED || '')
    .trim();
  const pinnedVersion = pinnedVersionInput
    ? extractVersionString(pinnedVersionInput)
    : null;
  const recommendedVersion = recommendedVersionInput
    ? extractVersionString(recommendedVersionInput)
    : null;
  const resolvedPinnedVersion = pinnedVersion || recommendedVersion;
  const versionOptions = {};

  if (pinnedVersionInput && !pinnedVersion) {
    console.warn(
      `[WWEBJS] WA_WEB_VERSION must be a valid version string (got "${pinnedVersionInput}").`
    );
  }
  if (recommendedVersionInput && !recommendedVersion) {
    console.warn(
      `[WWEBJS] WA_WEB_VERSION_RECOMMENDED must be a valid version string (got "${recommendedVersionInput}").`
    );
  }

  if (!cacheUrl && !pinnedVersionInput && !recommendedVersionInput) {
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
        if (!resolvedPinnedVersion) {
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

  if (resolvedPinnedVersion) {
    versionOptions.webVersion = resolvedPinnedVersion;
  }

  return {
    ...versionOptions,
    __webVersionMeta: {
      cacheUrl,
      pinnedVersionInput,
      recommendedVersionInput,
    },
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
    Boolean(webVersionMeta?.recommendedVersionInput) ||
    Boolean(webVersionMeta?.cacheUrl) ||
    sanitized.webVersionCache?.type === 'remote';
  if (shouldValidate && !isValidResolvedVersion) {
    const details = [];
    if (webVersionMeta?.pinnedVersionInput) {
      details.push(`WA_WEB_VERSION="${webVersionMeta.pinnedVersionInput}"`);
    }
    if (webVersionMeta?.recommendedVersionInput) {
      details.push(
        `WA_WEB_VERSION_RECOMMENDED="${webVersionMeta.recommendedVersionInput}"`
      );
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

async function withRuntimeTimeoutRetry(
  action,
  label,
  protocolTimeoutEnvVarName,
  clientId
) {
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
          `Retrying in ${backoffMs}ms (attempt ${attempt}/${DEFAULT_RUNTIME_TIMEOUT_RETRY_ATTEMPTS}). ` +
          `Protocol timeout env var: ${protocolTimeoutEnvVarName}. ` +
          `clientId=${clientId}.`,
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
  const initialAuthDataPath = resolveAuthDataPath();
  let authDataPath = initialAuthDataPath;
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
  const baseAuthDataPath = authDataPath;
  let activeAuthDataPath = baseAuthDataPath;
  let fallbackAttempt = 0;
  let lockActiveFailureCount = 0;
  const resolveSessionPath = () => buildSessionPath(activeAuthDataPath, clientId);
  const resolvePuppeteerProfilePath = () => resolveSessionPath();
  const resolveFallbackBasePath = () =>
    resolveFallbackAuthDataPath(baseAuthDataPath);
  let reinitInProgress = false;
  let connectInProgress = null;
  let connectStartedAt = null;
  const webVersionOptions = sanitizeWebVersionOptions(
    await resolveWebVersionOptions()
  );
  const puppeteerExecutablePath = await resolvePuppeteerExecutablePath();
  if (puppeteerExecutablePath) {
    console.info(
      `[WWEBJS] Resolved Puppeteer executable for clientId=${clientId}: ${puppeteerExecutablePath}.`
    );
  }
  const puppeteerProtocolTimeoutConfig =
    resolvePuppeteerProtocolTimeoutConfig(clientId);
  let puppeteerProtocolTimeoutMs = puppeteerProtocolTimeoutConfig.timeoutMs;
  const protocolTimeoutEnvVarName = puppeteerProtocolTimeoutConfig.envVarName;
  const protocolTimeoutMaxMs = resolveProtocolTimeoutMaxMs();
  const protocolTimeoutBackoffMultiplier =
    resolveProtocolTimeoutBackoffMultiplier();
  const connectRetryAttempts = resolveConnectRetryAttempts();
  const connectRetryBackoffMs = resolveConnectRetryBackoffMs();
  const connectRetryBackoffMultiplier = resolveConnectRetryBackoffMultiplier();
  const lockFallbackThreshold = resolveLockFallbackThreshold();
  const client = new Client({
    authStrategy: new LocalAuth({ clientId, dataPath: activeAuthDataPath }),
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

  const applyProtocolTimeout = (nextTimeoutMs, reasonLabel) => {
    const normalizedTimeoutMs = Math.max(Number(nextTimeoutMs) || 0, 0);
    if (!client.options.puppeteer) {
      client.options.puppeteer = {};
    }
    client.options.puppeteer.protocolTimeout = normalizedTimeoutMs;
    puppeteerProtocolTimeoutMs = normalizedTimeoutMs;
    console.warn(
      `[WWEBJS] Updated protocolTimeout to ${normalizedTimeoutMs}ms for clientId=${clientId}` +
        `${reasonLabel ? ` (${reasonLabel})` : ''}.`
    );
  };

  const maybeIncreaseProtocolTimeout = (triggerLabel, err) => {
    if (!isRuntimeCallTimeout(err)) {
      return false;
    }
    const resolvedMaxMs = Math.max(protocolTimeoutMaxMs, puppeteerProtocolTimeoutMs);
    if (puppeteerProtocolTimeoutMs >= resolvedMaxMs) {
      console.warn(
        `[WWEBJS] Runtime.callFunctionOn timed out for clientId=${clientId} (${triggerLabel}), ` +
          `but protocolTimeout is already at ${puppeteerProtocolTimeoutMs}ms (max ${resolvedMaxMs}ms). ` +
          `Protocol timeout env var: ${protocolTimeoutEnvVarName}.`
      );
      return false;
    }
    const scaledTimeoutMs = Math.round(
      puppeteerProtocolTimeoutMs * protocolTimeoutBackoffMultiplier
    );
    const incrementedTimeoutMs = Math.max(puppeteerProtocolTimeoutMs + 10000, scaledTimeoutMs);
    const nextTimeoutMs = Math.min(incrementedTimeoutMs, resolvedMaxMs);
    applyProtocolTimeout(
      nextTimeoutMs,
      `${triggerLabel}: Runtime.callFunctionOn timeout`
    );
    return true;
  };

  const applyWebVersionFallback = () => {
    client.options.webVersionCache = { type: 'none' };
    delete client.options.webVersion;
  };

  const applyAuthDataPath = async (nextPath, reasonLabel) => {
    if (!nextPath || nextPath === activeAuthDataPath) {
      return false;
    }
    const isWritable = await ensureAuthDataPathWritable(nextPath, false);
    if (!isWritable) {
      console.warn(
        `[WWEBJS] Fallback auth data path is not writable for clientId=${clientId}: ${nextPath}.`
      );
      return false;
    }
    activeAuthDataPath = nextPath;
    const authStrategy =
      client.authStrategy || client.options?.authStrategy || null;
    if (authStrategy && 'dataPath' in authStrategy) {
      authStrategy.dataPath = nextPath;
    }
    emitter.sessionPath = resolveSessionPath();
    console.warn(
      `[WWEBJS] Using fallback auth data path for clientId=${clientId} (${reasonLabel}): ${nextPath}.`
    );
    return true;
  };

  const cleanupPuppeteerLocks = async (profilePath = resolvePuppeteerProfilePath()) => {
    if (!profilePath) {
      return;
    }
    const lockFiles = ['SingletonLock', 'SingletonCookie', 'SingletonSocket'];
    await Promise.all(
      lockFiles.map(async (lockFile) => {
        const lockPath = path.join(profilePath, lockFile);
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

  const hasPuppeteerLocks = async (profilePath) => {
    const lockFiles = ['SingletonLock', 'SingletonCookie', 'SingletonSocket'];
    const results = await Promise.all(
      lockFiles.map(async (lockFile) => {
        const lockPath = path.join(profilePath, lockFile);
        try {
          await stat(lockPath);
          return true;
        } catch (err) {
          if (err?.code === 'ENOENT') {
            return false;
          }
          return false;
        }
      })
    );
    return results.some(Boolean);
  };

  const cleanupStaleBrowserLocks = async (contextLabel) => {
    const profilePath = resolvePuppeteerProfilePath();
    if (!profilePath) {
      return false;
    }
    const activeLockStatus = await detectActiveBrowserLock(profilePath);
    if (activeLockStatus.isActive) {
      console.warn(
        `[WWEBJS] Active browser lock detected before ${contextLabel} for clientId=${clientId} ` +
          `(reason: ${activeLockStatus.reason}); skipping lock cleanup.`
      );
      return false;
    }
    const hasLocks = await hasPuppeteerLocks(profilePath);
    if (!hasLocks) {
      return false;
    }
    await cleanupPuppeteerLocks(profilePath);
    console.warn(
      `[WWEBJS] Stale browser locks cleaned before ${contextLabel} for clientId=${clientId} at ${profilePath}.`
    );
    return true;
  };

  const recoverFromBrowserAlreadyRunning = async (triggerLabel, err) => {
    const strictLockRecovery = shouldUseStrictLockRecovery();
    const profilePath = resolvePuppeteerProfilePath();
    const activeLockStatus = await detectActiveBrowserLock(profilePath);
    const isActiveLock = activeLockStatus.isActive;
    const backoffMs = isActiveLock
      ? resolveActiveBrowserLockBackoffMs()
      : resolveBrowserLockBackoffMs();
    const activeReason = activeLockStatus.reason
      ? ` (active lock: ${activeLockStatus.reason})`
      : '';
    console.warn(
      `[WWEBJS] Detected browser lock for clientId=${clientId} (${triggerLabel})${activeReason}. ` +
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

    if (isActiveLock) {
      lockActiveFailureCount += 1;
      if (strictLockRecovery) {
        console.warn(
          `[WWEBJS] Active browser lock detected for clientId=${clientId}; ` +
            'skipping lock cleanup because WA_WWEBJS_LOCK_RECOVERY_STRICT=true.'
        );
      } else {
        console.warn(
          `[WWEBJS] Active browser lock detected for clientId=${clientId}; ` +
            'skipping lock cleanup to avoid stomping on a running browser session.'
        );
      }
    } else {
      lockActiveFailureCount = 0;
      await cleanupPuppeteerLocks(profilePath);
    }

    if (backoffMs > 0) {
      await delay(backoffMs);
    }

    if (isActiveLock && lockActiveFailureCount >= lockFallbackThreshold) {
      fallbackAttempt += 1;
      const fallbackBasePath = resolveFallbackBasePath();
      const fallbackPath = buildFallbackAuthDataPath(
        fallbackBasePath,
        clientId,
        fallbackAttempt
      );
      const fallbackApplied = await applyAuthDataPath(
        fallbackPath,
        `lock active fallback attempt ${fallbackAttempt}`
      );
      if (fallbackApplied) {
        console.warn(
          `[WWEBJS] Applying unique userDataDir fallback for clientId=${clientId} ` +
            `after ${lockActiveFailureCount} lock failures.`
        );
        lockActiveFailureCount = 0;
      }
    }

    if (isActiveLock && strictLockRecovery) {
      const error = new Error(
        `[WWEBJS] Browser lock still active for clientId=${clientId}. ` +
          'Reuse the existing session or stop the previous Chromium process before reinit.'
      );
      error.code = 'WA_WWEBJS_LOCK_ACTIVE';
      throw error;
    }
  };

  const initializeClientWithFallback = async (triggerLabel) => {
    emitter.fatalInitError = null;
    try {
      await client.initialize();
      lockActiveFailureCount = 0;
    } catch (err) {
      if (isMissingChromeError(err)) {
        let executableAccessible = false;
        if (puppeteerExecutablePath) {
          const diagnostics = await getExecutableDiagnostics(
            puppeteerExecutablePath
          );
          const accessLabel = diagnostics.accessOk
            ? 'OK'
            : diagnostics.accessErrorCode || 'UNKNOWN';
          const hints = buildExecutableRemediationHints(diagnostics);
          console.warn(
            `[WWEBJS] Missing Chrome diagnostics for clientId=${clientId} (${triggerLabel}): ` +
              `resolvedPath=${diagnostics.resolvedPath}, ` +
              `stat.mode=${formatFileMode(diagnostics.statMode)}, ` +
              `access=${accessLabel}` +
              (diagnostics.statErrorCode
                ? `, statError=${diagnostics.statErrorCode}`
                : '') +
              (hints.length ? `. Remediation: ${hints.join(' or ')}.` : '.')
          );
          executableAccessible = diagnostics.accessOk;
        } else {
          executableAccessible = await isExecutableAccessible(
            puppeteerExecutablePath
          );
        }
        if (!executableAccessible) {
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
        console.warn(
          `[WWEBJS] Missing Chrome error reported for clientId=${clientId} (${triggerLabel}) ` +
            `but executablePath is accessible at ${puppeteerExecutablePath}. ` +
            'Continuing initialization without marking fatalInitError.',
          err?.message || err
        );
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
      if (isRuntimeCallTimeout(err)) {
        const didIncrease = maybeIncreaseProtocolTimeout(triggerLabel, err);
        if (didIncrease) {
          try {
            await client.initialize();
            return;
          } catch (retryErr) {
            console.error(
              `[WWEBJS] initialize retry failed after protocolTimeout bump for clientId=${clientId} (${triggerLabel}):`,
              retryErr?.message || retryErr
            );
            throw retryErr;
          }
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

  const initializeClientWithRetry = async (triggerLabel) => {
    let lastError = null;
    for (let attempt = 1; attempt <= connectRetryAttempts; attempt += 1) {
      try {
        await initializeClientWithTimeout(`${triggerLabel}:attempt-${attempt}`);
        return;
      } catch (err) {
        lastError = err;
        if (err?.isMissingChromeError) {
          throw err;
        }
        if (attempt >= connectRetryAttempts) {
          break;
        }
        const backoffMs = Math.round(
          connectRetryBackoffMs * connectRetryBackoffMultiplier ** (attempt - 1)
        );
        console.warn(
          `[WWEBJS] initialize attempt ${attempt} failed for clientId=${clientId} (${triggerLabel}). ` +
            `Retrying in ${backoffMs}ms.`,
          err?.message || err
        );
        if (backoffMs > 0) {
          await delay(backoffMs);
        }
      }
    }
    throw lastError;
  };

  const startConnect = (triggerLabel) => {
    if (connectInProgress) {
      return connectInProgress;
    }
    connectStartedAt = Date.now();
    connectInProgress = (async () => {
      await cleanupStaleBrowserLocks(triggerLabel);
      await initializeClientWithRetry(triggerLabel);
    })().finally(() => {
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
      const currentSessionPath = resolveSessionPath();
      try {
        await rm(currentSessionPath, { recursive: true, force: true });
        console.warn(
          `[WWEBJS] Cleared auth session for clientId=${clientId} at ${currentSessionPath}.`
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
        'getNumberId',
        protocolTimeoutEnvVarName,
        clientId
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
        'getChat',
        protocolTimeoutEnvVarName,
        clientId
      );
    } catch (err) {
      console.warn('[WWEBJS] getChat failed:', err?.message || err);
      return null;
    }
  };

  emitter.sendMessage = async (jid, content, options = {}) => {
    const safeOptions = options && typeof options === 'object' ? options : {};
    const normalizedOptions = { sendSeen: false, ...safeOptions };
    const contentType = describeSendMessageContentType(content);
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
    if (!message || !message.id) {
      console.warn(
        `[WWEBJS] sendMessage returned no id (jid=${jid}, contentType=${contentType}).`
      );
      const error = new Error('sendMessage returned no id');
      error.jid = jid;
      error.contentType = contentType;
      error.retryable = false;
      throw error;
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
        'getContact',
        protocolTimeoutEnvVarName,
        clientId
      );
      return contact;
    } catch (err) {
      console.warn('[WWEBJS] getContact failed:', err?.message || err);
      return null;
    }
  };

  emitter.clientId = clientId;
  emitter.sessionPath = resolveSessionPath();
  emitter.getSessionPath = () => resolveSessionPath();
  emitter.puppeteerExecutablePath = puppeteerExecutablePath;
  emitter.getPuppeteerExecutablePath = () => puppeteerExecutablePath;

  return emitter;
}
