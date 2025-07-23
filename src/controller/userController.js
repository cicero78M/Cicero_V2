import * as userModel from '../model/userModel.js';
import { sendSuccess } from '../utils/response.js';

export const getAllUsers = async (req, res, next) => {
  try {
    const users = await userModel.getAllUsers();
    sendSuccess(res, users);
  } catch (err) {
    next(err);
  }
};

export const getUserById = async (req, res, next) => {
  try {
    const user = await userModel.findUserById(req.params.id);
    sendSuccess(res, user);
  } catch (err) {
    next(err);
  }
};

export const createUser = async (req, res, next) => {
  try {
    const user = await userModel.createUser(req.body);
    sendSuccess(res, user, 201);
  } catch (err) {
    next(err);
  }
};

export const updateUser = async (req, res, next) => {
  try {
    const user = await userModel.updateUser(req.params.id, req.body);
    sendSuccess(res, user);
  } catch (err) {
    next(err);
  }
};

export const deleteUser = async (req, res, next) => {
  try {
    const user = await userModel.deleteUser(req.params.id);
    sendSuccess(res, user);
  } catch (err) {
    next(err);
  }
};

// --- Query DB: User by client_id (aktif)
export const getUsersByClient = async (req, res, next) => {
  try {
    const users = await userModel.getUsersByClient(req.params.client_id);
    sendSuccess(res, users);
  } catch (err) {
    next(err);
  }
};

// --- Query DB: User by client_id (full, semua status)
export const getUsersByClientFull = async (req, res, next) => {
  try {
    const users = await userModel.getUsersByClientFull(req.params.client_id);
    sendSuccess(res, users);
  } catch (err) {
    next(err);
  }
};

// --- API: Ambil daftar user untuk User Directory, hanya dari client tertentu ---
export const getUserList = async (req, res, next) => {
  try {
    const role = req.user?.role;
    const tokenClientId = req.user?.client_id;
    let users;

    if (role === 'operator') {
      if (!tokenClientId) {
        return res
          .status(400)
          .json({ success: false, message: 'client_id wajib diisi' });
      }
      users = await userModel.getUsersByClient(tokenClientId);
    } else if (role === 'ditbinmas' || role === 'ditlantas') {
      users = await userModel.getUsersByDirektorat(role);
    } else {
      const clientId = req.query.client_id;
      if (!clientId) {
        return res
          .status(400)
          .json({ success: false, message: 'client_id wajib diisi' });
      }
      users = await userModel.getUsersByClient(clientId);
    }
    sendSuccess(res, users);
  } catch (err) {
    next(err);
  }
};
