import * as tiktokCommentModel from '../model/tiktokCommentModel.js';

export const findByVideoId = async (video_id) => {
  return await tiktokCommentModel.findByVideoId(video_id);
};



export const getRekapByClient = async (client_id, periode = 'harian') => {
  return await tiktokCommentModel.getRekapKomentarByClient(client_id, periode);
};

