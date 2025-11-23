import {
  listOfficialAccounts,
  createOfficialAccount,
  updateOfficialAccount,
  deleteOfficialAccount,
} from '../service/officialAccountService.js';
import { sendSuccess } from '../utils/response.js';

/**
 * Retrieve official accounts with optional filters provided via query parameters.
 */
export const getOfficialAccounts = async (req, res, next) => {
  try {
    const accounts = await listOfficialAccounts(req.query);
    sendSuccess(res, accounts);
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    next(err);
  }
};

/**
 * Create a new official account entry.
 */
export const postOfficialAccount = async (req, res, next) => {
  try {
    const account = await createOfficialAccount(req.body);
    sendSuccess(res, account, 201);
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    next(err);
  }
};

/**
 * Update an existing official account by id.
 */
export const putOfficialAccount = async (req, res, next) => {
  try {
    const account = await updateOfficialAccount(req.params.official_account_id, req.body);
    sendSuccess(res, account);
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    next(err);
  }
};

/**
 * Delete an official account by id.
 */
export const deleteOfficialAccountById = async (req, res, next) => {
  try {
    const removed = await deleteOfficialAccount(req.params.official_account_id);
    sendSuccess(res, removed);
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    next(err);
  }
};
