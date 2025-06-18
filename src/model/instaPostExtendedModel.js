import { query } from '../repository/db.js';

export async function upsertIgUser(user) {
  if (!user || !user.id) return;
  await query(
    `INSERT INTO ig_ext_users (user_id, username, full_name, is_private, is_verified, profile_pic_url)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (user_id) DO UPDATE
     SET username=EXCLUDED.username,
         full_name=EXCLUDED.full_name,
         is_private=EXCLUDED.is_private,
         is_verified=EXCLUDED.is_verified,
         profile_pic_url=EXCLUDED.profile_pic_url`,
    [user.id, user.username, user.full_name || null, user.is_private || false, user.is_verified || false, user.profile_pic_url || null]
  );
}

export async function upsertIgPost(post, userId) {
  await query(
    `INSERT INTO ig_ext_posts (post_id, user_id, caption_text, created_at, like_count, comment_count, is_video, media_type, is_pinned)
     VALUES ($1,$2,$3,to_timestamp($4),$5,$6,$7,$8,$9)
     ON CONFLICT (post_id) DO UPDATE SET
       caption_text=EXCLUDED.caption_text,
       like_count=EXCLUDED.like_count,
       comment_count=EXCLUDED.comment_count,
       is_video=EXCLUDED.is_video,
       media_type=EXCLUDED.media_type,
       is_pinned=EXCLUDED.is_pinned,
       created_at=to_timestamp($4)`,
    [
      post.id,
      userId,
      post.caption?.text || null,
      post.taken_at || post.taken_at_ts || null,
      post.like_count || 0,
      post.comment_count || 0,
      post.is_video || false,
      post.media_type || null,
      post.is_pinned || false,
    ]
  );
}

export async function upsertIgMedia(item, postId) {
  await query(
    `INSERT INTO ig_ext_media_items (media_id, post_id, media_type, is_video, original_width, original_height, image_url, video_url, video_duration, thumbnail_url)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     ON CONFLICT (media_id) DO UPDATE SET
       post_id=EXCLUDED.post_id,
       media_type=EXCLUDED.media_type,
       is_video=EXCLUDED.is_video,
       original_width=EXCLUDED.original_width,
       original_height=EXCLUDED.original_height,
       image_url=EXCLUDED.image_url,
       video_url=EXCLUDED.video_url,
       video_duration=EXCLUDED.video_duration,
       thumbnail_url=EXCLUDED.thumbnail_url`,
    [
      item.id,
      postId,
      item.media_type || null,
      item.is_video || false,
      item.original_width || null,
      item.original_height || null,
      item.image_versions?.items?.[0]?.url || null,
      item.video_url || null,
      item.video_duration || null,
      item.thumbnail_url || null,
    ]
  );
}

export async function insertHashtags(postId, hashtags=[]) {
  for (const h of hashtags) {
    if (!h) continue;
    await query(
      `INSERT INTO ig_ext_hashtags (post_id, hashtag)
       VALUES ($1,$2)
       ON CONFLICT DO NOTHING`,
      [postId, h.replace('#','')]
    );
  }
}

export async function upsertTaggedUsers(mediaId, tags=[]) {
  for (const tag of tags) {
    const u = tag.user;
    if (!u || !u.id) continue;
    await upsertIgUser(u);
    await query(
      `INSERT INTO ig_ext_tagged_users (media_id, user_id, x, y)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (media_id, user_id) DO UPDATE SET x=EXCLUDED.x, y=EXCLUDED.y`,
      [mediaId, u.id, tag.x || 0, tag.y || 0]
    );
  }
}
