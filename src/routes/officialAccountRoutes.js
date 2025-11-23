import { Router } from 'express';
import {
  deleteOfficialAccountById,
  getOfficialAccounts,
  postOfficialAccount,
  putOfficialAccount,
} from '../controller/officialAccountController.js';

const router = Router();

router.get('/', getOfficialAccounts);
router.post('/', postOfficialAccount);
router.put('/:official_account_id', putOfficialAccount);
router.delete('/:official_account_id', deleteOfficialAccountById);

export default router;
