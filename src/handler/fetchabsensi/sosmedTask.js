import { getShortcodesTodayByClient } from "../../model/instaPostModel.js";
import { getLikesByShortcode } from "../../model/instaLikeModel.js";
import { getPostsTodayByClient as getTiktokPostsToday } from "../../model/tiktokPostModel.js";
import { getCommentsByVideoId } from "../../model/tiktokCommentModel.js";
import { findClientById } from "../../service/clientService.js";
import { handleFetchLikesInstagram } from "../fetchengagement/fetchLikesInstagram.js";
import { handleFetchKomentarTiktokBatch } from "../fetchengagement/fetchCommentTiktok.js";

export async function generateSosmedTaskMessage(
  clientId = "DITBINMAS",
  skipTiktokFetch = false
) {

  let clientName = clientId;
  let tiktokUsername = "";

  try {
    const client = await findClientById(clientId);
    clientName = (client?.nama || clientId).toUpperCase();
    tiktokUsername = (client?.client_tiktok || "").replace(/^@/, "");
  } catch {
    // ignore errors, use defaults
  }

  let shortcodes = [];
  try {
    shortcodes = await getShortcodesTodayByClient(clientId);
    await handleFetchLikesInstagram(null, null, clientId);
  } catch {
    shortcodes = [];
  }

  const likeResults = await Promise.all(
    shortcodes.map((sc) => getLikesByShortcode(sc).catch(() => []))
  );

  let totalLikes = 0;
  const igDetails = shortcodes.map((sc, idx) => {
    const likes = likeResults[idx];
    const count = Array.isArray(likes) ? likes.length : 0;
    totalLikes += count;
    const suffix = count === 1 ? "like" : "likes";
    return `- https://www.instagram.com/p/${sc} : ${count} ${suffix}`;
  });

  let tiktokPosts = [];
  try {
    tiktokPosts = await getTiktokPostsToday(clientId);
    if (!skipTiktokFetch) {
      await handleFetchKomentarTiktokBatch(null, null, clientId);
    }
  } catch {
    tiktokPosts = [];
  }

  const commentResults = await Promise.all(
    tiktokPosts.map((post) =>
      getCommentsByVideoId(post.video_id).catch(() => ({ comments: [] }))
    )
  );

  let totalComments = 0;
  const tiktokDetails = tiktokPosts.map((post, idx) => {
    const { comments } = commentResults[idx];
    const count = Array.isArray(comments) ? comments.length : 0;
    totalComments += count;
    const link = tiktokUsername
      ? `https://www.tiktok.com/@${tiktokUsername}/video/${post.video_id}`
      : `https://www.tiktok.com/video/${post.video_id}`;
    return `- ${link} : ${count} komentar`;
  });

  let msg =
    "Mohon Ijin Komandan, Senior, Rekan Operator dan Personil pelaksana Tugas Likes dan komentar Sosial Media Ditbinmas.\n\n" +
    "Tugas Likes dan Komentar Konten Instagram dan Tiktok \n" +
    `${clientName}\n` +
    `Jumlah konten Instagram hari ini: ${shortcodes.length} \n` +
    `Total likes semua konten: ${totalLikes} \n\n` +
    "Rincian:\n";
  msg += igDetails.length ? igDetails.join("\n") : "-";
  msg +=
    `\n\nJumlah konten Tiktok hari ini: ${tiktokPosts.length} \n` +
    `Total komentar semua konten: ${totalComments}\n\n` +
    "Rincian:\n";
  msg += tiktokDetails.length ? tiktokDetails.join("\n") : "-";
  msg += "\n\nSilahkan Melaksanakan Likes, Komentar dan Share.";
  return {
    text: msg.trim(),
    igCount: shortcodes.length,
    tiktokCount: tiktokPosts.length,
  };
}

export default generateSosmedTaskMessage;
