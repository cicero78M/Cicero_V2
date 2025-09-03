import express from 'express';
import {
  requestOtp,
  verifyOtpController,
  getUserData,
  updateUserData,
} from '../controller/claimController.js';

const router = express.Router();

router.post('/request-otp', requestOtp);
router.post('/verify-otp', verifyOtpController);
router.post('/user-data', getUserData);
router.put('/update', updateUserData);

export default router;
