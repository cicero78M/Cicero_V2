import { jest } from '@jest/globals';

let generateOtp;
let verifyOtp;
let isVerified;
let clearVerification;

beforeAll(async () => {
  const store = new Map();
  jest.unstable_mockModule('../src/config/redis.js', () => ({
    default: {
      set: jest.fn(async (key, value, opts) => {
        const expiresAt = opts?.EX ? Date.now() + opts.EX * 1000 : null;
        store.set(key, { value, expiresAt });
      }),
      get: jest.fn(async (key) => {
        const entry = store.get(key);
        if (!entry) return null;
        if (entry.expiresAt && entry.expiresAt < Date.now()) {
          store.delete(key);
          return null;
        }
        return entry.value;
      }),
      del: jest.fn(async (key) => {
        store.delete(key);
      }),
    },
  }));
  ({ generateOtp, verifyOtp, isVerified, clearVerification } = await import('../src/service/otpService.js'));
});

test('generateOtp and verifyOtp flow', async () => {
  const otp = await generateOtp('u1', '0812');
  expect(otp).toHaveLength(6);
  expect(await verifyOtp('u1', '0812', '000000')).toBe(false);
  expect(await verifyOtp('u1', '0812', otp)).toBe(true);
  expect(await isVerified('u1', '0812')).toBe(true);
  await clearVerification('u1');
  expect(await isVerified('u1', '0812')).toBe(false);
});

test('nrp handled consistently for strings and numbers', async () => {
  const otp = await generateOtp(1, '0812');
  expect(await verifyOtp('1', '0812', otp)).toBe(true);
  expect(await isVerified(1, '0812')).toBe(true);
  await clearVerification('1');
});
