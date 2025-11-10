import { query } from '../repository/db.js';

const normalizePlatform = (value) => value?.trim().toLowerCase();

export async function findByClientId(client_id) {
  const res = await query(
    `SELECT satbinmas_account_id, client_id, platform, username, is_active, created_at, updated_at
     FROM satbinmas_official_accounts
     WHERE LOWER(client_id) = LOWER($1)
     ORDER BY platform ASC, created_at ASC`,
    [client_id]
  );
  return res.rows;
}

export async function findByClientIdAndPlatform(client_id, platform) {
  const normalizedPlatform = normalizePlatform(platform);
  const res = await query(
    `SELECT satbinmas_account_id, client_id, platform, username, is_active, created_at, updated_at
     FROM satbinmas_official_accounts
     WHERE LOWER(client_id) = LOWER($1) AND LOWER(platform) = LOWER($2)
     LIMIT 1`,
    [client_id, normalizedPlatform]
  );
  return res.rows[0] || null;
}

export async function findById(accountId) {
  const res = await query(
    `SELECT satbinmas_account_id, client_id, platform, username, is_active, created_at, updated_at
     FROM satbinmas_official_accounts
     WHERE satbinmas_account_id = $1
     LIMIT 1`,
    [accountId]
  );
  return res.rows[0] || null;
}

export async function upsertAccount({ client_id, platform, username, is_active }) {
  const normalizedPlatform = normalizePlatform(platform);
  const trimmedUsername = username?.trim();
  const res = await query(
    `INSERT INTO satbinmas_official_accounts (client_id, platform, username, is_active)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (client_id, platform) DO UPDATE
       SET username = EXCLUDED.username,
           is_active = EXCLUDED.is_active,
           updated_at = NOW()
     RETURNING satbinmas_account_id, client_id, platform, username, is_active, created_at, updated_at`,
    [client_id, normalizedPlatform, trimmedUsername, is_active]
  );
  return res.rows[0] || null;
}

export async function removeById(accountId) {
  const res = await query(
    `DELETE FROM satbinmas_official_accounts
     WHERE satbinmas_account_id = $1
     RETURNING satbinmas_account_id, client_id, platform, username, is_active, created_at, updated_at`,
    [accountId]
  );
  return res.rows[0] || null;
}
