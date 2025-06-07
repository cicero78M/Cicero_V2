import express from 'express';
import * as clientController from '../controller/clientController.js';

const router = express.Router();

router.get('/', clientController.getAllClients);
router.get('/:id', clientController.getClientById);
router.put('/:id', clientController.updateClient);
router.delete('/:id', clientController.deleteClient);

export default router;
