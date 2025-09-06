import express from 'express';
import * as userController from '../controller/userController.js';

const router = express.Router();

router.put('/', userController.updateUserRoleIds);

export default router;
