import { searchInstagramUsers, fetchInstagramInfo } from './instaRapidService.js';
import { findAllKota } from '../model/poldaModel.js';
import { upsertSearchUser, findAllUsernames } from '../model/instaUserSearchModel.js';
import { upsertProfile } from './instaProfileService.js';

export async function searchAllCities() {
  const cities = await findAllKota();
  for (const kota of cities) {
    const results = await searchInstagramUsers(kota.nama, 5);
    for (const r of results) {
      await upsertSearchUser({
        username: r.username,
        full_name: r.full_name,
        instagram_id: r.id || r.pk,
        is_private: r.is_private,
        is_verified: r.is_verified,
        profile_pic_url: r.profile_pic_url,
      });
    }
  }
}

export async function fetchInfoForAllUsers() {
  const usernames = await findAllUsernames();
  for (const username of usernames) {
    const info = await fetchInstagramInfo(username);
    if (info) {
      await upsertProfile({
        username: info.username,
        full_name: info.full_name,
        biography: info.biography,
        follower_count: info.follower_count || info.followers_count,
        following_count: info.following_count,
        post_count: info.media_count || info.posts_count,
        profile_pic_url: info.profile_pic_url_hd || info.profile_pic_url,
      });
    }
  }
}
