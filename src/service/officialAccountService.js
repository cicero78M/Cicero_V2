import * as clientModel from '../model/clientModel.js';
import * as officialAccountRepository from '../repository/officialAccountRepository.js';

// Supported social platforms for official accounts.
const allowedPlatforms = ['instagram', 'tiktok', 'facebook', 'twitter', 'youtube'];

function createError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function normalizePlatform(platform) {
  return platform?.trim().toLowerCase();
}

function parseBoolean(value, fieldName) {
  if (value === undefined) return undefined;
  if (typeof value === 'boolean') return value;

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'y'].includes(normalized)) return true;
    if (['false', '0', 'no', 'n'].includes(normalized)) return false;
  }

  if (typeof value === 'number') {
    if (value === 1) return true;
    if (value === 0) return false;
  }

  throw createError(`${fieldName} must be a boolean value`, 400);
}

async function ensureClientExists(clientId) {
  const client = await clientModel.findById(clientId);
  if (!client) {
    throw createError('Client not found', 404);
  }
  return client;
}

async function ensureSinglePrimary({ client_id, platform, allowMultiplePrimary, currentId }) {
  if (allowMultiplePrimary) {
    return;
  }

  const existingPrimaries = await officialAccountRepository.list({
    client_id,
    platform,
    is_primary: true,
  });

  const conflict = existingPrimaries.find(acc => acc.official_account_id !== currentId);
  if (conflict) {
    throw createError('Primary account already exists for this client and platform', 409);
  }
}

function validatePlatform(platform) {
  const normalized = normalizePlatform(platform);
  if (!normalized) {
    throw createError('platform is required', 400);
  }

  if (!allowedPlatforms.includes(normalized)) {
    throw createError(`platform must be one of: ${allowedPlatforms.join(', ')}`, 400);
  }

  return normalized;
}

function sanitizeHandle(handle) {
  const trimmed = handle?.trim();
  if (!trimmed) {
    throw createError('handle is required', 400);
  }
  return trimmed;
}

export async function listOfficialAccounts(filters = {}) {
  /**
   * Return official accounts filtered by client, platform, or status flags.
   * Platform validation and optional client existence check prevent dangling queries.
   */
  const parsedFilters = { ...filters };

  if (filters.platform) {
    parsedFilters.platform = validatePlatform(filters.platform);
  }

  if (filters.status !== undefined) {
    parsedFilters.status = parseBoolean(filters.status, 'status');
  }

  if (filters.is_primary !== undefined) {
    parsedFilters.is_primary = parseBoolean(filters.is_primary, 'is_primary');
  }

  if (filters.client_id) {
    await ensureClientExists(filters.client_id);
  }

  return officialAccountRepository.list(parsedFilters);
}

export async function createOfficialAccount(payload = {}) {
  /**
   * Create a new official account after validating platform, handle, and primary constraints.
   */
  const {
    client_id,
    platform,
    handle,
    display_name,
    links,
    is_primary,
    is_active,
    is_verified,
    allowMultiplePrimary,
  } = payload;

  if (!client_id) {
    throw createError('client_id is required', 400);
  }
  await ensureClientExists(client_id);

  const normalizedPlatform = validatePlatform(platform);
  const trimmedHandle = sanitizeHandle(handle);

  const parsedIsPrimary = parseBoolean(is_primary ?? false, 'is_primary');
  const parsedIsActive = parseBoolean(is_active ?? true, 'is_active');
  const parsedIsVerified = parseBoolean(is_verified ?? false, 'is_verified');
  const allowMultiplePrimaryFlag =
    allowMultiplePrimary !== undefined
      ? parseBoolean(allowMultiplePrimary, 'allowMultiplePrimary')
      : false;

  if (parsedIsPrimary) {
    await ensureSinglePrimary({
      client_id,
      platform: normalizedPlatform,
      allowMultiplePrimary: allowMultiplePrimaryFlag,
    });
  }

  return officialAccountRepository.create({
    client_id,
    platform: normalizedPlatform,
    handle: trimmedHandle,
    display_name: display_name?.trim(),
    links,
    is_primary: parsedIsPrimary,
    is_active: parsedIsActive,
    is_verified: parsedIsVerified,
  });
}

export async function updateOfficialAccount(official_account_id, payload = {}) {
  /**
   * Update an existing official account while ensuring single primary per platform per client.
   */
  if (!official_account_id) {
    throw createError('official_account_id is required', 400);
  }

  const existing = await officialAccountRepository.findById(official_account_id);
  if (!existing) {
    throw createError('Official account not found', 404);
  }

  const updates = {};

  if (payload.platform !== undefined) {
    updates.platform = validatePlatform(payload.platform);
  }

  if (payload.handle !== undefined) {
    updates.handle = sanitizeHandle(payload.handle);
  }

  if (payload.display_name !== undefined) {
    updates.display_name = payload.display_name?.trim();
  }

  if (payload.links !== undefined) {
    updates.links = payload.links;
  }

  if (payload.is_primary !== undefined) {
    updates.is_primary = parseBoolean(payload.is_primary, 'is_primary');
  }

  if (payload.is_active !== undefined) {
    updates.is_active = parseBoolean(payload.is_active, 'is_active');
  }

  if (payload.is_verified !== undefined) {
    updates.is_verified = parseBoolean(payload.is_verified, 'is_verified');
  }

  const targetPlatform = updates.platform || existing.platform;
  const targetIsPrimary = updates.is_primary ?? existing.is_primary;
  const allowMultiplePrimaryFlag =
    payload.allowMultiplePrimary !== undefined
      ? parseBoolean(payload.allowMultiplePrimary, 'allowMultiplePrimary')
      : false;

  if (targetIsPrimary) {
    await ensureSinglePrimary({
      client_id: existing.client_id,
      platform: targetPlatform,
      allowMultiplePrimary: allowMultiplePrimaryFlag,
      currentId: existing.official_account_id,
    });
  }

  return officialAccountRepository.update(official_account_id, updates);
}

export async function deleteOfficialAccount(official_account_id) {
  if (!official_account_id) {
    throw createError('official_account_id is required', 400);
  }

  const existing = await officialAccountRepository.findById(official_account_id);
  if (!existing) {
    throw createError('Official account not found', 404);
  }

  return officialAccountRepository.remove(official_account_id);
}
