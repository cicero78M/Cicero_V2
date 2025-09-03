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
    normalizeWhatsappNumber: (nohp) => {
      let number = String(nohp).replace(/\D/g, '');
      if (!number.startsWith('62')) number = '62' + number.replace(/^0/, '');
      return number;
    },
  }));
  jest.unstable_mockModule('../src/service/otpQueue.js', () => ({
    enqueueOtp: jest.fn().mockResolvedValue(),
  }));
  ({ requestOtp } = await import('../src/controller/claimController.js'));
  userModel = await import('../src/model/userModel.js');
});

test('allows request when stored whatsapp matches after normalization', async () => {
  userModel.findUserById.mockResolvedValue({ user_id: '1', whatsapp: '08123' });
  const req = { body: { nrp: '1', whatsapp: '628123' } };
  const res = createRes();
  await requestOtp(req, res, () => {});
  expect(res.status).toHaveBeenCalledWith(202);
});

test('rejects request when stored whatsapp differs', async () => {
  userModel.findUserById.mockResolvedValue({ user_id: '1', whatsapp: '08123' });
  const req = { body: { nrp: '1', whatsapp: '08124' } };
  const res = createRes();
  await requestOtp(req, res, () => {});
  expect(res.status).toHaveBeenCalledWith(400);
});

test('returns 503 when enqueueOtp fails', async () => {
  userModel.findUserById.mockResolvedValue({ user_id: '1', whatsapp: '08123' });
  const req = { body: { nrp: '1', whatsapp: '628123' } };
  const res = createRes();
  const { enqueueOtp } = await import('../src/service/otpQueue.js');
  enqueueOtp.mockRejectedValue(new Error('queue fail'));
  await requestOtp(req, res, () => {});
  expect(res.status).toHaveBeenCalledWith(503);
});

test('returns 503 when findUserById throws connection error', async () => {
  const err = Object.assign(new Error('ECONNREFUSED'), { code: 'ECONNREFUSED' });
  userModel.findUserById.mockRejectedValue(err);
  const req = { body: { nrp: '1', whatsapp: '628123' } };
  const res = createRes();
  await requestOtp(req, res, () => {});
  expect(res.status).toHaveBeenCalledWith(503);
  expect(res.json).toHaveBeenCalledWith({ success: false, message: 'Database tidak tersedia' });
});
