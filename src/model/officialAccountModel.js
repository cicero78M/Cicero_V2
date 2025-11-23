import { query } from '../repository/db.js';

const normalizePlatform = (value) => value?.trim().toLowerCase();

const baseSelect = `
  SELECT official_account_id, client_id, platform, handle, display_name, links, is_primary, is_active, is_verified, created_at, updated_at
  FROM official_accounts
`;

function buildFilters({ client_id, platform, status, is_primary } = {}) {
  const conditions = [];
  const values = [];

  if (client_id) {
    values.push(client_id);
    conditions.push(`LOWER(client_id) = LOWER($${values.length})`);
  }

  if (platform) {
    const normalizedPlatform = normalizePlatform(platform);
    values.push(normalizedPlatform);
    conditions.push(`LOWER(platform) = LOWER($${values.length})`);
  }

  if (status !== undefined) {
    values.push(status);
    conditions.push(`is_active = $${values.length}`);
  }

  if (is_primary !== undefined) {
    values.push(is_primary);
    conditions.push(`is_primary = $${values.length}`);
  }

  if (!conditions.length) {
    return { clause: '', values };
  }

  return { clause: `WHERE ${conditions.join(' AND ')}`, values };
}

export async function listOfficialAccounts(filters = {}) {
  const { clause, values } = buildFilters(filters);
  const res = await query(
    `${baseSelect}
     ${clause}
     ORDER BY client_id ASC, platform ASC, handle ASC`,
    values
  );
  return res.rows;
}

export async function findOfficialAccountById(official_account_id) {
  const res = await query(
    `${baseSelect}
     WHERE official_account_id = $1
     LIMIT 1`,
    [official_account_id]
  );
  return res.rows[0] || null;
}

export async function createOfficialAccount(payload) {
  const {
    client_id,
    platform,
    handle,
    display_name,
    links,
    is_primary = false,
    is_active = true,
    is_verified = false,
  } = payload;

  const normalizedPlatform = normalizePlatform(platform);
  const trimmedHandle = handle?.trim();
  const trimmedDisplayName = display_name?.trim();

  const res = await query(
    `INSERT INTO official_accounts (client_id, platform, handle, display_name, links, is_primary, is_active, is_verified)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING official_account_id, client_id, platform, handle, display_name, links, is_primary, is_active, is_verified, created_at, updated_at`,
    [client_id, normalizedPlatform, trimmedHandle, trimmedDisplayName, links || null, is_primary, is_active, is_verified]
  );

  return res.rows[0] || null;
}

export async function updateOfficialAccount(official_account_id, updates = {}) {
  const setParts = [];
  const values = [];

  if (updates.platform !== undefined) {
    values.push(normalizePlatform(updates.platform));
    setParts.push(`platform = $${values.length}`);
  }

  if (updates.handle !== undefined) {
    values.push(updates.handle?.trim());
    setParts.push(`handle = $${values.length}`);
  }

  if (updates.display_name !== undefined) {
    values.push(updates.display_name?.trim());
    setParts.push(`display_name = $${values.length}`);
  }

  if (updates.links !== undefined) {
    values.push(updates.links);
    setParts.push(`links = $${values.length}`);
  }

  if (updates.is_primary !== undefined) {
    values.push(updates.is_primary);
    setParts.push(`is_primary = $${values.length}`);
  }

  if (updates.is_active !== undefined) {
    values.push(updates.is_active);
    setParts.push(`is_active = $${values.length}`);
  }

  if (updates.is_verified !== undefined) {
    values.push(updates.is_verified);
    setParts.push(`is_verified = $${values.length}`);
  }

  if (!setParts.length) {
    return findOfficialAccountById(official_account_id);
  }

  values.push(official_account_id);
  const res = await query(
    `UPDATE official_accounts
     SET ${setParts.join(', ')}, updated_at = NOW()
     WHERE official_account_id = $${values.length}
     RETURNING official_account_id, client_id, platform, handle, display_name, links, is_primary, is_active, is_verified, created_at, updated_at`,
    values
  );

  return res.rows[0] || null;
}

export async function deleteOfficialAccount(official_account_id) {
  const res = await query(
    `DELETE FROM official_accounts
     WHERE official_account_id = $1
     RETURNING official_account_id, client_id, platform, handle, display_name, links, is_primary, is_active, is_verified, created_at, updated_at`,
    [official_account_id]
  );
  return res.rows[0] || null;
}
