import dotenv from 'dotenv';
import { cleanEnv, str, port, bool } from 'envalid';

dotenv.config();

export const env = cleanEnv(process.env, {
  PORT: port({ default: 3000 }),
  DB_USER: str({ default: '' }),
  DB_HOST: str({ default: '' }),
  DB_NAME: str({ default: '' }),
  DB_PASS: str({ default: '' }),
  DB_PORT: port({ default: 5432 }),
  DB_DRIVER: str({ default: 'postgres' }),
  REDIS_URL: str({ default: 'redis://localhost:6379' }),
  CORS_ORIGIN: str({ default: '*' }),
  ALLOW_DUPLICATE_REQUESTS: bool({ default: false }),
  SECRET_KEY: str({ default: '' }),
  RAPIDAPI_KEY: str({ default: '' }),
  ADMIN_WHATSAPP: str({ default: '' }),
  APP_SESSION_NAME: str({ default: '' }),
  DEBUG_FETCH_INSTAGRAM: bool({ default: false }),
  INSTAGRAM_APP_ID: str({ default: '' }),
  INSTAGRAM_APP_SECRET: str({ default: '' }),
  INSTAGRAM_REDIRECT_URI: str({ default: '' }),
  AMQP_URL: str({ default: 'amqp://localhost' })
});
