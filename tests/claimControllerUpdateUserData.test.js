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
        email: 'user@example.com',
        insta: 'https://www.instagram.com/de_saputra88?igsh=MWJxMnY1YmtnZ3Rmeg==',
        tiktok: 'https://www.tiktok.com/@sidik.prayitno37?_t=ZS-8zPPyl5Q4SO&_r=1'
      }
    };
    const res = createRes();
    await updateUserData(req, res, () => {});
    expect(userModel.updateUser).toHaveBeenCalledWith('1', expect.objectContaining({
      insta: 'de_saputra88',
      tiktok: '@sidik.prayitno37'
    }));
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  test('rejects instagram cicero_devs', async () => {
    const req = {
      body: {
        nrp: '1',
        email: 'user@example.com',
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
        email: 'user@example.com',
        tiktok: 'cicero_devs'
      }
    };
    const res = createRes();
    await updateUserData(req, res, () => {});
    expect(res.status).toHaveBeenCalledWith(400);
    expect(userModel.updateUser).not.toHaveBeenCalled();
  });

  test('allows empty tiktok without error', async () => {
    const req = {
      body: {
        nrp: '1',
        email: 'user@example.com',
        tiktok: ''
      }
    };
    const res = createRes();
    await updateUserData(req, res, () => {});
    const [, data] = userModel.updateUser.mock.calls[0];
    expect(data.tiktok).toBeUndefined();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  test('verifies otp when provided', async () => {
    jest.resetModules();
    jest.unstable_mockModule('../src/model/userModel.js', () => ({
      updateUser: jest.fn().mockResolvedValue({ ok: true }),
      findUserById: jest.fn(),
      updateUserField: jest.fn()
    }));
    jest.unstable_mockModule('../src/service/otpService.js', () => ({
      isVerified: jest.fn().mockResolvedValue(false),
      clearVerification: jest.fn(),
      generateOtp: jest.fn(),
      verifyOtp: jest.fn().mockResolvedValue(true)
    }));
    jest.unstable_mockModule('../src/service/otpQueue.js', () => ({
      enqueueOtp: jest.fn(),
    }));
    ({ updateUserData } = await import('../src/controller/claimController.js'));
    userModel = await import('../src/model/userModel.js');
    const otpService = await import('../src/service/otpService.js');
    const req = { body: { nrp: '1', email: 'user@example.com', otp: '123456' } };
    const res = createRes();
    await updateUserData(req, res, () => {});
    expect(otpService.verifyOtp).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });
});
