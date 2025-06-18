import { env } from '../config/env.js';
import * as postgres from './postgres.js';

let adapter = postgres;

if (env.DB_DRIVER && env.DB_DRIVER.toLowerCase() === 'sqlite') {
  adapter = await import('./sqlite.js');
} else if (env.DB_DRIVER && env.DB_DRIVER.toLowerCase() === 'mysql') {
  adapter = await import('./mysql.js');
}

export const query = async (text, params) => {
  console.log('[DB QUERY]', text, params);
  try {
    const res = await adapter.query(text, params);
    const count = res?.rowCount ?? res?.rows?.length ?? 0;
    console.log('[DB RESULT]', count);
    return res;
  } catch (err) {
    console.error('[DB ERROR]', err.message, { text, params });
    throw err;
  }
};

export const close = () => adapter.close?.();
