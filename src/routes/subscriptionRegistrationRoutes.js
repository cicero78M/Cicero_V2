import express from 'express';
import * as controller from '../controller/subscriptionRegistrationController.js';

const router = express.Router();

router.get('/', controller.getAllRegistrations);
router.get('/:id', controller.getRegistrationById);
router.post('/', controller.createRegistration);
router.put('/:id', controller.updateRegistration);
router.delete('/:id', controller.deleteRegistration);

export default router;
