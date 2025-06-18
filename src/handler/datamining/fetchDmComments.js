import pLimit from 'p-limit';
import { fetchAllInstagramComments } from '../../service/instagramApi.js';
import { upsertInstaComments } from '../../model/instaCommentModel.js';
import { getShortcodesTodayByUsername } from '../../model/instaPostModel.js';
import { sendDebug } from '../../middleware/debugHandler.js';

const limit = pLimit(3);

export async function handleFetchKomentarInstagramDM(username) {
  try {
    const shortcodes = await getShortcodesTodayByUsername(username);
    if (!shortcodes.length) {
      sendDebug({ tag: 'IG DM COMMENT', msg: `Tidak ada post IG hari ini untuk @${username}` });
      return;
    }
    let sukses = 0, gagal = 0;
    for (const sc of shortcodes) {
      await limit(async () => {
        try {
          const comments = await fetchAllInstagramComments(sc);
          await upsertInstaComments(sc, comments);
          sukses++;
        } catch (err) {
          gagal++;
          sendDebug({ tag: 'IG DM COMMENT ERROR', msg: `Gagal ${sc}: ${err.message}` });
        }
      });
    }
    sendDebug({ tag: 'IG DM COMMENT', msg: `Selesai komentar @${username}. Berhasil: ${sukses}, Gagal: ${gagal}` });
  } catch (err) {
    sendDebug({ tag: 'IG DM COMMENT ERROR', msg: err.message });
  }
}
