import { pool } from '../config/db.js';

export const query = (text, params) => pool.query(text, params);
