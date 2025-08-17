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
    const role = req.user?.role?.toLowerCase();
    const adminClientId = req.user?.client_id;
    const data = { ...req.body };

    if (role === 'ditbinmas' || role === 'ditlantas' || role === 'bidhumas') {
      if (adminClientId) data.client_id = adminClientId;
      if (role === 'ditbinmas') data.ditbinmas = true;
      if (role === 'ditlantas') data.ditlantas = true;
      if (role === 'bidhumas') data.bidhumas = true;

      const existing = await userModel.findUserById(data.user_id);
      if (existing) {
        delete data.user_id;
        Object.keys(data).forEach((k) => {
          if (data[k] === undefined) delete data[k];
        });
        const updated = await userModel.updateUser(existing.user_id, data);
        sendSuccess(res, updated);
        return;
      }

      const user = await userModel.createUser(data);
      sendSuccess(res, user, 201);
      return;
    }

    if (role === 'operator') {
      if (data.ditbinmas === undefined) data.ditbinmas = false;
      if (data.ditlantas === undefined) data.ditlantas = false;
      if (data.bidhumas === undefined) data.bidhumas = false;
      data.operator = true;
    }

    const user = await userModel.createUser(data);
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
    } else if (['ditbinmas', 'ditlantas', 'bidhumas'].includes(role)) {
      if (!tokenClientId) {
        return res
          .status(400)
          .json({ success: false, message: 'client_id wajib diisi' });
      }
      if (tokenClientId.toUpperCase() === role.toUpperCase()) {
        users = await userModel.getUsersByDirektorat(role);
      } else {
        users = await userModel.getUsersByDirektorat(role, tokenClientId);
      }
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
