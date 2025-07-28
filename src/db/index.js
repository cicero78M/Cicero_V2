import { env } from '../config/env.js';
import * as postgres from './postgres.js';

let adapter = postgres;

if (env.DB_DRIVER && env.DB_DRIVER.toLowerCase() === 'sqlite') {
  adapter = await import('./sqlite.js');
} else if (env.DB_DRIVER && env.DB_DRIVER.toLowerCase() === 'mysql') {
  adapter = await import('./mysql.js');
}

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
