import * as userModel from '../model/userModel.js';
import { sendSuccess } from '../utils/response.js';

export const getAllUsers = async (req, res, next) => {
  try {
    // Ambil semua user (dari file json, legacy)
    const users = await userModel.findAll();
    sendSuccess(res, users);
  } catch (err) {
    next(err);
  }
};

export const getUserById = async (req, res, next) => {
  try {
    const user = await userModel.findById(req.params.id);
    sendSuccess(res, user);
  } catch (err) {
    next(err);
  }
};

export const createUser = async (req, res, next) => {
  try {
    const user = await userModel.create(req.body);
    sendSuccess(res, user, 201);
  } catch (err) {
    next(err);
  }
};

export const updateUser = async (req, res, next) => {
  try {
    const user = await userModel.update(req.params.id, req.body);
    sendSuccess(res, user);
  } catch (err) {
    next(err);
  }
};

export const deleteUser = async (req, res, next) => {
  try {
    const user = await userModel.remove(req.params.id);
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
    const client_id = req.query.client_id;
    if (!client_id) {
      return res.status(400).json({ success: false, message: "client_id wajib diisi" });
    }
    // Hanya ambil user milik client_id, status aktif
    const users = await userModel.getUsersByClient(client_id);
    sendSuccess(res, users);
  } catch (err) {
    next(err);
  }
};
