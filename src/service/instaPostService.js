import * as instaPostModel from '../model/instaPostModel.js';

export const findByClientId = async (_clientId) => {
  const fixedClientId = 'ditbinmas';
  return await instaPostModel.getPostsByClientId(fixedClientId);
};
