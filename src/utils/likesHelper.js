import { getLikesByShortcode } from "../model/instaLikeModel.js";
import { getClientsByRole, getUsersByDirektorat } from "../model/userModel.js";
import { groupByDivision } from "./utilsHelper.js";

export function normalizeUsername(username) {
  return (username || "")
    .toString()
    .trim()
    .replace(/^@/, "")
    .toLowerCase();
}

export async function getLikesSets(shortcodes) {
  const likesLists = await Promise.all(
    shortcodes.map((sc) => getLikesByShortcode(sc))
  );
  return likesLists.map(
    (likes) => new Set((likes || []).map(normalizeUsername))
  );
}

export async function groupUsersByClientDivision(roleName, opts = {}) {
  const { clientFilter, selfOnly } = opts;
  let polresIds;
  let allUsers;

  if (selfOnly) {
    const cid = String(clientFilter || roleName).toUpperCase();
    polresIds = [cid];
    allUsers = (
      await getUsersByDirektorat(roleName, [cid])
    ).filter((u) => u.status === true);
  } else if (clientFilter) {
    polresIds = [String(clientFilter).toUpperCase()];
    allUsers = (
      await getUsersByDirektorat(roleName, clientFilter)
    ).filter((u) => u.status === true);
  } else {
    polresIds = (await getClientsByRole(roleName)).map((c) => c.toUpperCase());
    allUsers = (
      await getUsersByDirektorat(roleName, polresIds)
    ).filter((u) => u.status === true);
  }

  const usersByClient = {};
  allUsers.forEach((u) => {
    const cid = u.client_id?.toUpperCase() || "";
    if (!usersByClient[cid]) usersByClient[cid] = [];
    usersByClient[cid].push(u);
  });

  const usersByClientDiv = {};
  Object.keys(usersByClient).forEach((cid) => {
    usersByClientDiv[cid] = groupByDivision(usersByClient[cid]);
  });

  return { polresIds, usersByClient, usersByClientDiv };
}

