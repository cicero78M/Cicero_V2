import { getShortcodesTodayByClient } from "../../model/instaPostModel.js";
import { getLikesByShortcode } from "../../model/instaLikeModel.js";
import { getPostsTodayByClient as getTiktokPostsToday } from "../../model/tiktokPostModel.js";
import { getCommentsByVideoId } from "../../model/tiktokCommentModel.js";
import { findClientById } from "../../service/clientService.js";

export async function generateSosmedTaskMessage(clientId) {
  const client = await findClientById(clientId);
  const clientName = (client?.nama || clientId).toUpperCase();
  const tiktokUsername = (client?.client_tiktok || "").replace(/^@/, "");

  const shortcodes = await getShortcodesTodayByClient(clientId);
  let totalLikes = 0;
  const igDetails = [];
  for (const sc of shortcodes) {
    const likes = await getLikesByShortcode(sc);
    const count = Array.isArray(likes) ? likes.length : 0;
    totalLikes += count;
    igDetails.push(`- https://www.instagram.com/p/${sc} : ${count} like`);
  }

  const tiktokPosts = await getTiktokPostsToday(clientId);
  let totalComments = 0;
  const tiktokDetails = [];
  for (const post of tiktokPosts) {
    const { comments } = await getCommentsByVideoId(post.video_id);
    const count = Array.isArray(comments) ? comments.length : 0;
    totalComments += count;
    const link = `https://www.tiktok.com/@${tiktokUsername}/video/${post.video_id}`;
    tiktokDetails.push(`- ${link} : ${count} komentar`);
  }

  let msg =
    "Mohon Ijin Komandan, Senior, Rekan Operator dan Personil pelaksana Tugas Likes dan komentar Sosial Media Ditbinmas.\n\n" +
    "Tugas Likes dan Komentar Konten Instagram dan Tiktok \n" +
    `${clientName}\n` +
    `Jumlah konten Instagram hari ini: ${shortcodes.length} \n` +
    `Total engagement semua konten: ${totalLikes} \n\n` +
    "Rincian:\n";
  msg += igDetails.length ? igDetails.join("\n") : "-";
  msg +=
    `\n\nJumlah konten Tiktok hari ini: ${tiktokPosts.length} \n` +
    `Total likes semua konten: ${totalComments}\n\n` +
    "Rincian:\n";
  msg += tiktokDetails.length ? tiktokDetails.join("\n") : "-";
  msg += "\n\nSilahkan Melaksanakan Likes, Komentar dan Share.";
  return msg.trim();
}

export default generateSosmedTaskMessage;

