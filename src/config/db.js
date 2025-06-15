import pkg from 'pg';
import { env } from './env.js';
const { Pool } = pkg;

export const pool = new Pool({
  user: env.DB_USER,
  host: env.DB_HOST,
  database: env.DB_NAME,
  password: env.DB_PASS,
  port: env.DB_PORT,
});
