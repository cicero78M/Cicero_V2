import pLimit from 'p-limit';
import { fetchAllInstagramLikesItems } from '../../service/instagramApi.js';
import { upsertInstaLike } from '../../model/instaLikeModel.js';
import { insertIgPostLikeUsers } from '../../model/igPostLikeUserModel.js';
import { upsertIgUser } from '../../model/instaPostExtendedModel.js';
import { getShortcodesTodayByUsername } from '../../model/instaPostModel.js';
import { sendDebug } from '../../middleware/debugHandler.js';

const limit = pLimit(3);

export async function handleFetchLikesInstagramDM(username) {
  try {
    const shortcodes = await getShortcodesTodayByUsername(username);
    if (!shortcodes.length) {
      sendDebug({ tag: 'IG DM LIKES', msg: `Tidak ada post IG hari ini untuk @${username}` });
      return;
    }
    let sukses = 0, gagal = 0;
    for (const sc of shortcodes) {
      await limit(async () => {
        try {
          const likes = await fetchAllInstagramLikesItems(sc);
          await upsertInstaLike(sc, likes);
          for (const u of likes) {
            await upsertIgUser(u);
          }
          await insertIgPostLikeUsers(sc, likes);
          sukses++;
        } catch (err) {
          gagal++;
          sendDebug({ tag: 'IG DM LIKES ERROR', msg: `[${sc}] ${err.message}` });
        }
      });
    }
    sendDebug({ tag: 'IG DM LIKES', msg: `Selesai likes @${username}. Berhasil: ${sukses}, Gagal: ${gagal}` });
  } catch (err) {
    sendDebug({ tag: 'IG DM LIKES ERROR', msg: err.message });
  }
}
