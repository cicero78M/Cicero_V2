import * as instaPostModel from '../model/instaPostModel.js';

export const findByClientId = async (clientId) => {
  return await instaPostModel.getPostsByClientId(clientId);
};

export const findTodayByClientId = async (clientId) => {
  return await instaPostModel.getPostsTodayByClient(clientId);
};
