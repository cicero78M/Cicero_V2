import { env } from '../config/env.js';
import * as postgres from './postgres.js';

let adapter = postgres;

if (env.DB_DRIVER && env.DB_DRIVER.toLowerCase() === 'sqlite') {
  adapter = await import('./sqlite.js');
} else if (env.DB_DRIVER && env.DB_DRIVER.toLowerCase() === 'mysql') {
  adapter = await import('./mysql.js');
}

export const query = (text, params) => adapter.query(text, params);
export const close = () => adapter.close?.();
