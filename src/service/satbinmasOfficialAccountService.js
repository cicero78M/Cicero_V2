import * as clientModel from '../model/clientModel.js';
import * as satbinmasOfficialAccountModel from '../model/satbinmasOfficialAccountModel.js';

function createError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function parseOptionalBoolean(value, fallback) {
  if (value === undefined) {
    if (fallback !== undefined) {
      return fallback;
    }
    return true;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    return value !== 0;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'y', 'aktif', 'active'].includes(normalized)) {
      return true;
    }
    if (['false', '0', 'no', 'n', 'nonaktif', 'inactive'].includes(normalized)) {
      return false;
    }
  }

  throw createError('is_active must be a boolean value', 400);
}

export async function listSatbinmasOfficialAccounts(clientId) {
  const client = await clientModel.findById(clientId);
  if (!client) {
    throw createError('Client not found', 404);
  }
  return satbinmasOfficialAccountModel.findByClientId(client.client_id);
}

export async function saveSatbinmasOfficialAccount(clientId, payload = {}) {
  const client = await clientModel.findById(clientId);
  if (!client) {
    throw createError('Client not found', 404);
  }

  const { platform, username, is_active } = payload;

  if (!platform || !platform.trim()) {
    throw createError('platform is required', 400);
  }

  if (!username || !username.trim()) {
    throw createError('username is required', 400);
  }

  const normalizedPlatform = platform.trim().toLowerCase();
  const trimmedUsername = username.trim();

  const existing = await satbinmasOfficialAccountModel.findByClientIdAndPlatform(
    client.client_id,
    normalizedPlatform
  );

  const normalizedIsActive = parseOptionalBoolean(is_active, existing?.is_active);

  const account = await satbinmasOfficialAccountModel.upsertAccount({
    client_id: client.client_id,
    platform: normalizedPlatform,
    username: trimmedUsername,
    is_active: normalizedIsActive,
  });

  return {
    account,
    created: !existing,
  };
}

export async function deleteSatbinmasOfficialAccount(clientId, accountId) {
  if (!accountId) {
    throw createError('satbinmas_account_id is required', 400);
  }

  const client = await clientModel.findById(clientId);
  if (!client) {
    throw createError('Client not found', 404);
  }

  const account = await satbinmasOfficialAccountModel.findById(accountId);
  if (!account || account.client_id.toLowerCase() !== client.client_id.toLowerCase()) {
    throw createError('Satbinmas official account not found', 404);
  }

  return satbinmasOfficialAccountModel.removeById(accountId);
}
