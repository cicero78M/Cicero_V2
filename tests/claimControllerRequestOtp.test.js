import { jest } from '@jest/globals';

let requestOtp;
let userModel;

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
    generateOtp: jest.fn().mockReturnValue('123456'),
    verifyOtp: jest.fn(),
    isVerified: jest.fn(),
    clearVerification: jest.fn(),
  }));
  jest.unstable_mockModule('../src/utils/waHelper.js', () => ({
    formatToWhatsAppId: (n) => n,
    normalizeWhatsappNumber: (nohp) => {
      let number = String(nohp).replace(/\D/g, '');
      if (!number.startsWith('62')) number = '62' + number.replace(/^0/, '');
      return number;
    },
    safeSendMessage: jest.fn().mockResolvedValue(true),
  }));
  jest.unstable_mockModule('../src/service/waService.js', () => ({
    default: {},
    waitForWaReady: jest.fn().mockResolvedValue(),
  }));
  ({ requestOtp } = await import('../src/controller/claimController.js'));
  userModel = await import('../src/model/userModel.js');
});

test('allows request when stored whatsapp matches after normalization', async () => {
  userModel.findUserById.mockResolvedValue({ user_id: '1', whatsapp: '08123' });
  const req = { body: { nrp: '1', whatsapp: '628123' } };
  const res = createRes();
  await requestOtp(req, res, () => {});
  expect(res.status).toHaveBeenCalledWith(200);
});

test('rejects request when stored whatsapp differs', async () => {
  userModel.findUserById.mockResolvedValue({ user_id: '1', whatsapp: '08123' });
  const req = { body: { nrp: '1', whatsapp: '08124' } };
  const res = createRes();
  await requestOtp(req, res, () => {});
  expect(res.status).toHaveBeenCalledWith(400);
});

test('returns 503 when waitForWaReady fails', async () => {
  userModel.findUserById.mockResolvedValue({ user_id: '1', whatsapp: '08123' });
  const req = { body: { nrp: '1', whatsapp: '628123' } };
  const res = createRes();
  const { waitForWaReady } = await import('../src/service/waService.js');
  waitForWaReady.mockRejectedValue(new Error('not ready'));
  await requestOtp(req, res, () => {});
  expect(res.status).toHaveBeenCalledWith(503);
});

test('returns 503 when safeSendMessage returns false', async () => {
  userModel.findUserById.mockResolvedValue({ user_id: '1', whatsapp: '08123' });
  const req = { body: { nrp: '1', whatsapp: '628123' } };
  const res = createRes();
  const { safeSendMessage } = await import('../src/utils/waHelper.js');
  safeSendMessage.mockResolvedValue(false);
  await requestOtp(req, res, () => {});
  expect(res.status).toHaveBeenCalledWith(503);
});
