import { jest } from '@jest/globals';

let generateOtp;
let verifyOtp;
let isVerified;
let clearVerification;

beforeAll(async () => {
  ({ generateOtp, verifyOtp, isVerified, clearVerification } = await import('../src/service/otpService.js'));
});

test('generateOtp and verifyOtp flow', () => {
  const otp = generateOtp('u1', '0812');
  expect(otp).toHaveLength(6);
  expect(verifyOtp('u1', '0812', '000000')).toBe(false);
  expect(verifyOtp('u1', '0812', otp)).toBe(true);
  expect(isVerified('u1', '0812')).toBe(true);
  clearVerification('u1');
  expect(isVerified('u1', '0812')).toBe(false);
});

test('nrp handled consistently for strings and numbers', () => {
  const otp = generateOtp(1, '0812');
  expect(verifyOtp('1', '0812', otp)).toBe(true);
  expect(isVerified(1, '0812')).toBe(true);
  clearVerification('1');
});
