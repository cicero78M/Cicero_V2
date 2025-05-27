import crypto from 'crypto';
const ALGORITHM = 'aes-256-cbc';
const KEY = Buffer.from(process.env.APP_SECRET_KEY, 'hex');
const IV = Buffer.from(process.env.APP_SECRET_IV, 'hex');

export function encrypt(text) {
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, IV);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return encrypted;
}

export function decrypt(encrypted) {
  const decipher = crypto.createDecipheriv(ALGORITHM, KEY, IV);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}
