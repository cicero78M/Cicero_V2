import * as userModel from '../model/userModel.js';

export const findAllUsers = async () => await userModel.findAll();

export const findUserById = async (id) => await userModel.findById(id);

export const createUser = async (data) => await userModel.create(data);

export const updateUser = async (id, data) => await userModel.update(id, data);

export const deleteUser = async (id) => await userModel.remove(id);
