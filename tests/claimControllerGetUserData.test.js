import { jest } from '@jest/globals';

let getUserData;
let userModel;
let otpService;

function createRes() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  };
}

beforeEach(async () => {
  jest.resetModules();
  jest.unstable_mockModule('../src/model/userModel.js', () => ({
    findUserById: jest.fn(),
  }));
  jest.unstable_mockModule('../src/service/otpService.js', () => ({
    generateOtp: jest.fn(),
    verifyOtp: jest.fn(),
    isVerified: jest.fn(),
    clearVerification: jest.fn(),
  }));
  jest.unstable_mockModule('../src/service/otpQueue.js', () => ({
    enqueueOtp: jest.fn(),
  }));
  jest.unstable_mockModule('../src/utils/waHelper.js', () => ({
    normalizeWhatsappNumber: (nohp) => {
      let number = String(nohp).replace(/\D/g, '');
      if (!number.startsWith('62')) number = '62' + number.replace(/^0/, '');
      return number;
    },
  }));
  ({ getUserData } = await import('../src/controller/claimController.js'));
  userModel = await import('../src/model/userModel.js');
  otpService = await import('../src/service/otpService.js');
});

test('returns user data when verified', async () => {
  userModel.findUserById.mockResolvedValue({ user_id: '1', nama: 'Test' });
  otpService.isVerified.mockResolvedValue(true);
  const req = { body: { nrp: '1', whatsapp: '08123' } };
  const res = createRes();
  await getUserData(req, res, () => {});
  expect(res.status).toHaveBeenCalledWith(200);
  expect(res.json).toHaveBeenCalledWith({ success: true, data: { user_id: '1', nama: 'Test' } });
});

test('rejects when OTP not verified', async () => {
  otpService.isVerified.mockResolvedValue(false);
  const req = { body: { nrp: '1', whatsapp: '08123' } };
  const res = createRes();
  await getUserData(req, res, () => {});
  expect(res.status).toHaveBeenCalledWith(403);
});

test('normalizes nrp before fetching user', async () => {
  userModel.findUserById.mockResolvedValue({ user_id: '00123', nama: 'Test' });
  otpService.isVerified.mockResolvedValue(true);
  const req = { body: { nrp: ' 00-123 ', whatsapp: '08123' } };
  const res = createRes();
  await getUserData(req, res, () => {});
  expect(userModel.findUserById).toHaveBeenCalledWith('00123');
  expect(res.status).toHaveBeenCalledWith(200);
});
