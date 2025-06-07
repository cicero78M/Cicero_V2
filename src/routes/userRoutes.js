import express from 'express';
import * as userController from '../controller/userController.js';

const router = express.Router();

// === Legacy (JSON) CRUD
router.get('/', userController.getAllUsers);
router.get('/:id', userController.getUserById);
router.post('/', userController.createUser);
router.put('/:id', userController.updateUser);
router.delete('/:id', userController.deleteUser);

// === DB endpoints
router.get('/by-client/:client_id', userController.getUsersByClient);
router.get('/by-client-full/:client_id', userController.getUsersByClientFull);

export default router;
