import * as instaPostModel from '../model/instaPostModel.js';

export const findByClientId = async (client_id) => {
  return await instaPostModel.findByClientId(client_id);
};
