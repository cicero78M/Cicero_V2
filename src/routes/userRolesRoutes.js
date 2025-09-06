import express from 'express';
import * as userController from '../controller/userController.js';

const router = express.Router();

router.put('/update', userController.updateUserRoleIds);

export default router;
