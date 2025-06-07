import * as clientService from '../service/clientService.js';
import { sendSuccess } from '../utils/response.js';

export const getAllClients = async (req, res, next) => {
  try {
    const clients = await clientService.findAllClients();
    sendSuccess(res, clients);
  } catch (err) {
    next(err);
  }
};
export const getClientById = async (req, res, next) => {
  try {
    const client = await clientService.findClientById(req.params.id);
    if (!client) return res.status(404).json({ error: 'Client not found' });
    sendSuccess(res, client);
  } catch (err) {
    next(err);
  }
};

export const updateClient = async (req, res, next) => {
  try {
    const client = await clientService.updateClient(req.params.id, req.body);
    if (!client) return res.status(404).json({ error: 'Client not found' });
    sendSuccess(res, client);
  } catch (err) {
    next(err);
  }
};

export const deleteClient = async (req, res, next) => {
  try {
    const client = await clientService.deleteClient(req.params.id);
    if (!client) return res.status(404).json({ error: 'Client not found' });
    sendSuccess(res, client);
  } catch (err) {
    next(err);
  }
};
