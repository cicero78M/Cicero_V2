import { env } from '../config/env.js';
import * as postgres from './postgres.js';

let adapter = postgres;

if (env.DB_DRIVER && env.DB_DRIVER.toLowerCase() === 'sqlite') {
  adapter = await import('./sqlite.js');
} else if (env.DB_DRIVER && env.DB_DRIVER.toLowerCase() === 'mysql') {
  adapter = await import('./mysql.js');
}

// Ensure newer columns exist for backwards compatibility
// Particularly, older deployments may lack the `whatsapp` field on
// `dashboard_user`, causing inserts to fail. The following migration
// runs once at startup and safely adds the column if missing.
await adapter.query(
  'ALTER TABLE IF EXISTS dashboard_user ADD COLUMN IF NOT EXISTS whatsapp VARCHAR'
);

export const query = async (text, params) => {
  const shouldLog = process.env.NODE_ENV !== 'production';
  const paramSummary = Array.isArray(params)
    ? `[${params.length} params]`
    : params && typeof params === 'object'
    ? `object with ${Object.keys(params).length} keys`
    : params !== undefined
    ? 'scalar param'
    : 'none';
  if (shouldLog) {
    console.log('[DB QUERY]', text, paramSummary);
  }
  try {
    const res = await adapter.query(text, params);
    const count = res?.rowCount ?? res?.rows?.length ?? 0;
    console.log('[DB RESULT]', count);
    return res;
  } catch (err) {
    if (shouldLog) {
      console.error('[DB ERROR]', err.message, { text, paramSummary });
    } else {
      console.error('[DB ERROR]', err.message);
    }
    throw err;
  }
};

export const close = () => adapter.close?.();
