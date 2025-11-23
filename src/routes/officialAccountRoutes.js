import { Router } from 'express';
import {
  deleteOfficialAccountById,
  getOfficialAccounts,
  postOfficialAccount,
  putOfficialAccount,
} from '../controller/officialAccountController.js';
import { officialAccountAccess } from '../middleware/officialAccountAccess.js';

const router = Router();

// Role rules:
// - Ditbinmas can create, update, and delete official accounts for any client.
// - Polres and Kasat Binmas may only manage accounts within their assigned client_id scope.
// - Bhabinkamtibmas users are read-only and can only list accounts.
router.use('/:official_account_id?', officialAccountAccess);

router.get('/', getOfficialAccounts);
router.post('/', postOfficialAccount);
router.put('/:official_account_id', putOfficialAccount);
router.delete('/:official_account_id', deleteOfficialAccountById);

export default router;
