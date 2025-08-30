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
  JWT_SECRET: str({ default: 'development-jwt-secret' }),
  RAPIDAPI_KEY: str({ default: '' }),
  ADMIN_WHATSAPP: str({ default: '' }),
  APP_SESSION_NAME: str({ default: 'cicero-session' }),
  DEBUG_FETCH_INSTAGRAM: bool({ default: false }),
  AMQP_URL: str({ default: 'amqp://localhost' }),
  BACKUP_DIR: str({ default: 'backups' }),
  GOOGLE_DRIVE_FOLDER_ID: str({ default: '' }),
  GOOGLE_SERVICE_ACCOUNT: str({ default: '' }),
  GOOGLE_IMPERSONATE_EMAIL: str({ default: '' }),
  GOOGLE_CONTACT_SCOPE: str({
    default: 'https://www.googleapis.com/auth/contacts'
  }),
  ENABLE_CRON_JOBS: bool({ default: false }),
  CRON_JOBS: str({ default: '' })
});
