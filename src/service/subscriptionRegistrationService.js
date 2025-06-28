import * as model from '../model/subscriptionRegistrationModel.js';

export const createRegistration = async data => model.createRegistration(data);

export const getRegistrations = async () => model.getRegistrations();

export const findRegistrationById = async id => model.findRegistrationById(id);

export const updateRegistration = async (id, data) =>
  model.updateRegistration(id, data);

export const deleteRegistration = async id => model.deleteRegistration(id);
