import { encrypt, decrypt } from '../src/utils/crypt.js';

describe('crypt utilities', () => {
  const KEY = 'jest-secret-key';

  beforeAll(() => {
    process.env.SECRET_KEY = KEY;
  });

  test('decrypt(encrypt(text)) returns original text', () => {
    const text = 'Hello from Jest';
    const encrypted = encrypt(text);
    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(text);
  });
});
