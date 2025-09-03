import { jest } from '@jest/globals';

let updateUserData;
let userModel;

describe('updateUserData', () => {
  beforeEach(async () => {
    jest.resetModules();
    jest.unstable_mockModule('../src/model/userModel.js', () => ({
      updateUser: jest.fn().mockResolvedValue({ ok: true }),
      findUserById: jest.fn(),
      updateUserField: jest.fn()
    }));
    jest.unstable_mockModule('../src/service/otpService.js', () => ({
      isVerified: () => true,
      clearVerification: jest.fn(),
      generateOtp: jest.fn(),
      verifyOtp: jest.fn()
    }));
    jest.unstable_mockModule('../src/service/otpQueue.js', () => ({
      enqueueOtp: jest.fn(),
    }));
    ({ updateUserData } = await import('../src/controller/claimController.js'));
    userModel = await import('../src/model/userModel.js');
  });

  function createRes() {
    return {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
  }

  test('extracts usernames from links', async () => {
    const req = {
      body: {
        nrp: '1',
        whatsapp: '08123',
        insta: 'https://www.instagram.com/TestUser?igsh=abc',
        tiktok: 'https://www.tiktok.com/@TikUser?lang=id'
      }
    };
    const res = createRes();
    await updateUserData(req, res, () => {});
    expect(userModel.updateUser).toHaveBeenCalledWith('1', expect.objectContaining({
      insta: 'testuser',
      tiktok: '@tikuser'
    }));
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  test('rejects instagram cicero_devs', async () => {
    const req = {
      body: {
        nrp: '1',
        whatsapp: '08123',
        insta: 'cicero_devs'
      }
    };
    const res = createRes();
    await updateUserData(req, res, () => {});
    expect(res.status).toHaveBeenCalledWith(400);
    expect(userModel.updateUser).not.toHaveBeenCalled();
  });

  test('rejects tiktok cicero_devs', async () => {
    const req = {
      body: {
        nrp: '1',
        whatsapp: '08123',
        tiktok: 'cicero_devs'
      }
    };
    const res = createRes();
    await updateUserData(req, res, () => {});
    expect(res.status).toHaveBeenCalledWith(400);
    expect(userModel.updateUser).not.toHaveBeenCalled();
  });
});
