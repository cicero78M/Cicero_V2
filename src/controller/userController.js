import * as userService from '../service/userService.js';
import { sendSuccess } from '../utils/response.js';

export const getAllUsers = async (req, res, next) => {
  try {
    const users = await userService.findAllUsers();
    sendSuccess(res, users);
  } catch (err) {
    next(err);
  }
};

export const getUserById = async (req, res, next) => {
  try {
    const user = await userService.findUserById(req.params.id);
    sendSuccess(res, user);
  } catch (err) {
    next(err);
  }
};

export const createUser = async (req, res, next) => {
  try {
    const user = await userService.createUser(req.body);
    sendSuccess(res, user, 201);
  } catch (err) {
    next(err);
  }
};

export const updateUser = async (req, res, next) => {
  try {
    const user = await userService.updateUser(req.params.id, req.body);
    sendSuccess(res, user);
  } catch (err) {
    next(err);
  }
};

export const deleteUser = async (req, res, next) => {
  try {
    const user = await userService.deleteUser(req.params.id);
    sendSuccess(res, user);
  } catch (err) {
    next(err);
  }
};
