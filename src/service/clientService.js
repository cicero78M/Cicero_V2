import * as clientModel from '../model/clientModel.js';

export const findAllClients = async () => await clientModel.findAll();

export const findClientById = async (client_id) => await clientModel.findById(client_id);

export const createClient = async (data) => await clientModel.create(data);

export const updateClient = async (client_id, data) => await clientModel.update(client_id, data);

export const deleteClient = async (client_id) => await clientModel.remove(client_id);