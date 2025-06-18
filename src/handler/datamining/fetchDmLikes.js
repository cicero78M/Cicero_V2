import pLimit from 'p-limit';
import { fetchAllInstagramLikes } from '../../service/instagramApi.js';
import { upsertIgPostLike } from '../../model/igPostLikeModel.js';
import { getPostIdsTodayByUsername } from '../../model/instaPostExtendedModel.js';
import { sendDebug } from '../../middleware/debugHandler.js';

const limit = pLimit(3);

export async function handleFetchLikesInstagramDM(username) {
  try {
    const ids = await getPostIdsTodayByUsername(username);
    if (!ids.length) {
      sendDebug({ tag: 'IG DM LIKES', msg: `Tidak ada post IG hari ini untuk @${username}` });
      return;
    }
    let sukses = 0, gagal = 0;
    for (const id of ids) {
      await limit(async () => {
        try {
          const likes = await fetchAllInstagramLikes(id);
          await upsertIgPostLike(id, likes);
          sukses++;
        } catch (err) {
          gagal++;
          sendDebug({ tag: 'IG DM LIKES ERROR', msg: `[${id}] ${err.message}` });
        }
      });
    }
    sendDebug({ tag: 'IG DM LIKES', msg: `Selesai likes @${username}. Berhasil: ${sukses}, Gagal: ${gagal}` });
  } catch (err) {
    sendDebug({ tag: 'IG DM LIKES ERROR', msg: err.message });
  }
}
