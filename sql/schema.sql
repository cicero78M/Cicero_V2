CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE clients (
  client_id VARCHAR PRIMARY KEY,
  nama VARCHAR NOT NULL,
  client_type VARCHAR,
  client_status BOOLEAN DEFAULT TRUE,
  client_insta VARCHAR,
  client_insta_status BOOLEAN DEFAULT TRUE,
  client_tiktok VARCHAR,
  client_tiktok_status BOOLEAN DEFAULT TRUE,
  client_amplify_status BOOLEAN DEFAULT TRUE,
  client_operator VARCHAR,
  client_group VARCHAR,
  tiktok_secuid VARCHAR,
  client_super VARCHAR
);

CREATE TABLE "user" (
  user_id VARCHAR PRIMARY KEY,
  nama VARCHAR,
  title VARCHAR,
  divisi VARCHAR,
  insta VARCHAR,
  tiktok VARCHAR,
  desa VARCHAR,
  client_id VARCHAR REFERENCES clients(client_id),
  status BOOLEAN DEFAULT TRUE,
  premium_status BOOLEAN DEFAULT FALSE,
  premium_end_date DATE
);

CREATE TABLE roles (
  role_id SERIAL PRIMARY KEY,
  role_name VARCHAR UNIQUE
);

CREATE TABLE user_roles (
  user_id VARCHAR REFERENCES "user"(user_id),
  role_id INTEGER REFERENCES roles(role_id),
  PRIMARY KEY (user_id, role_id)
);

CREATE TABLE penmas_user (
  user_id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE dashboard_user (
  dashboard_user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL,
  status BOOLEAN DEFAULT TRUE,
  user_id VARCHAR REFERENCES "user"(user_id),
  whatsapp VARCHAR,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE dashboard_user_clients (
  dashboard_user_id UUID REFERENCES dashboard_user(dashboard_user_id),
  client_id VARCHAR REFERENCES clients(client_id),
  PRIMARY KEY (dashboard_user_id, client_id)
);

CREATE TABLE insta_post (
  shortcode VARCHAR PRIMARY KEY,
  client_id VARCHAR REFERENCES clients(client_id),
  caption TEXT,
  comment_count INT,
  thumbnail_url TEXT,
  is_video BOOLEAN DEFAULT FALSE,
  video_url TEXT,
  image_url TEXT,
  images_url JSONB,
  is_carousel BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP
);

CREATE TABLE insta_like (
  shortcode VARCHAR PRIMARY KEY REFERENCES insta_post(shortcode),
  likes JSONB,
  updated_at TIMESTAMP
);

CREATE TABLE insta_comment (
  shortcode VARCHAR PRIMARY KEY REFERENCES insta_post(shortcode),
  comments JSONB,
  updated_at TIMESTAMP
);

CREATE TABLE insta_post_khusus (
  shortcode VARCHAR PRIMARY KEY,
  client_id VARCHAR REFERENCES clients(client_id),
  caption TEXT,
  comment_count INT,
  thumbnail_url TEXT,
  is_video BOOLEAN DEFAULT FALSE,
  video_url TEXT,
  image_url TEXT,
  images_url JSONB,
  is_carousel BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP
);

CREATE TABLE insta_profile (
  username VARCHAR PRIMARY KEY,
  full_name VARCHAR,
  biography TEXT,
  follower_count INT,
  following_count INT,
  post_count INT,
  profile_pic_url TEXT,
  updated_at TIMESTAMP
);

CREATE TABLE tiktok_post (
  video_id VARCHAR PRIMARY KEY,
  client_id VARCHAR REFERENCES clients(client_id),
  caption TEXT,
  like_count INT,
  comment_count INT,
  created_at TIMESTAMP
);

CREATE TABLE tiktok_comment (
  video_id VARCHAR PRIMARY KEY REFERENCES tiktok_post(video_id),
  comments JSONB,
  updated_at TIMESTAMP
);


-- Instagram data tables
-- Tabel utama dengan informasi profil dasar
CREATE TABLE instagram_user (
    user_id                 VARCHAR(30) PRIMARY KEY,
    username                VARCHAR(100) UNIQUE NOT NULL,
    full_name               VARCHAR(100),
    biography               TEXT,
    business_contact_method VARCHAR(50),
    category                VARCHAR(100),
    category_id             BIGINT,
    account_type            SMALLINT,
    contact_phone_number    VARCHAR(30),
    external_url            TEXT,
    fbid_v2                 VARCHAR(40),
    is_business             BOOLEAN,
    is_private              BOOLEAN,
    is_verified             BOOLEAN,
    public_email            VARCHAR(100),
    public_phone_country_code VARCHAR(10),
    public_phone_number     VARCHAR(30),
    profile_pic_url         TEXT,
    profile_pic_url_hd      TEXT
);

-- Statistik/metric akun
CREATE TABLE instagram_user_metrics (
    user_id                 VARCHAR(30) PRIMARY KEY REFERENCES instagram_user(user_id),
    follower_count          INT,
    following_count         INT,
    media_count             INT,
    total_igtv_videos       INT,
    latest_reel_media       BIGINT
);

-- Extended tables for storing detailed Instagram data fetched from RapidAPI
CREATE TABLE IF NOT EXISTS ig_ext_users (
    user_id VARCHAR(50) PRIMARY KEY,
    username VARCHAR(100) NOT NULL,
    full_name VARCHAR(100),
    is_private BOOLEAN,
    is_verified BOOLEAN,
    profile_pic_url TEXT
);

CREATE TABLE IF NOT EXISTS ig_ext_posts (
    post_id VARCHAR(50) PRIMARY KEY,
    shortcode VARCHAR(50) UNIQUE REFERENCES insta_post(shortcode) ON DELETE CASCADE,
    user_id VARCHAR(50) REFERENCES ig_ext_users(user_id),
    caption_text TEXT,
    created_at TIMESTAMP,
    like_count INT,
    comment_count INT,
    is_video BOOLEAN,
    media_type INT,
    is_pinned BOOLEAN
);

CREATE TABLE IF NOT EXISTS ig_ext_media_items (
    media_id VARCHAR(50) PRIMARY KEY,
    post_id VARCHAR(50) REFERENCES ig_ext_posts(post_id) ON DELETE CASCADE,
    media_type INT,
    is_video BOOLEAN,
    original_width INT,
    original_height INT,
    image_url TEXT,
    video_url TEXT,
    video_duration REAL,
    thumbnail_url TEXT
);

CREATE TABLE IF NOT EXISTS ig_ext_tagged_users (
    media_id VARCHAR(50) REFERENCES ig_ext_media_items(media_id) ON DELETE CASCADE,
    user_id VARCHAR(50) REFERENCES ig_ext_users(user_id),
    x REAL,
    y REAL,
    PRIMARY KEY (media_id, user_id)
);

CREATE TABLE IF NOT EXISTS ig_ext_hashtags (
    post_id VARCHAR(50) REFERENCES ig_ext_posts(post_id) ON DELETE CASCADE,
    hashtag VARCHAR(100),
    PRIMARY KEY (post_id, hashtag)
);

-- Informasi detail hashtag dari endpoint RapidAPI
CREATE TABLE IF NOT EXISTS ig_hashtag_info (
    hashtag_id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    profile_pic_url TEXT,
    media_count INT,
    formatted_media_count VARCHAR(20),
    is_trending BOOLEAN,
    allow_muting_story BOOLEAN,
    hide_use_hashtag_button BOOLEAN,
    show_follow_drop_down BOOLEAN,
    content_advisory TEXT,
    subtitle TEXT,
    warning_message TEXT
);

-- Statistik lanjutan untuk setiap post
CREATE TABLE IF NOT EXISTS ig_post_metrics (
    post_id VARCHAR(50) PRIMARY KEY REFERENCES ig_ext_posts(post_id) ON DELETE CASCADE,
    play_count INT,
    save_count INT,
    share_count INT,
    view_count INT,
    fb_like_count INT,
    fb_play_count INT
);

-- Relational table for individual likes
CREATE TABLE IF NOT EXISTS ig_post_like_users (
    post_id VARCHAR(50) REFERENCES ig_ext_posts(post_id) ON DELETE CASCADE,
    user_id VARCHAR(50) REFERENCES ig_ext_users(user_id),
    username VARCHAR(100),
    PRIMARY KEY (post_id, user_id)
);

-- Store individual comments for a post
CREATE TABLE IF NOT EXISTS ig_post_comments (
    comment_id VARCHAR(50) PRIMARY KEY,
    post_id VARCHAR(50) REFERENCES ig_ext_posts(post_id) ON DELETE CASCADE,
    user_id VARCHAR(50) REFERENCES ig_ext_users(user_id),
    text TEXT,
    created_at TIMESTAMP
);

CREATE TABLE visitor_logs (
    id SERIAL PRIMARY KEY,
    ip VARCHAR,
    user_agent TEXT,
    visited_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS link_report (
    shortcode VARCHAR REFERENCES insta_post(shortcode) ON DELETE CASCADE,
    user_id VARCHAR REFERENCES "user"(user_id),
    instagram_link TEXT,
    facebook_link TEXT,
    twitter_link TEXT,
    tiktok_link TEXT,
    youtube_link TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (shortcode, user_id)
);

CREATE TABLE IF NOT EXISTS link_report_khusus (
    shortcode VARCHAR REFERENCES insta_post_khusus(shortcode),
    user_id VARCHAR REFERENCES "user"(user_id),
    instagram_link TEXT,
    facebook_link TEXT,
    twitter_link TEXT,
    tiktok_link TEXT,
    youtube_link TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (shortcode, user_id)
);


CREATE TABLE IF NOT EXISTS editorial_event (
  event_id SERIAL PRIMARY KEY,
  event_date TIMESTAMP NOT NULL,
  topic TEXT NOT NULL,
  judul_berita TEXT,
  assignee VARCHAR(50),
  status VARCHAR(20) DEFAULT 'draft',
  content TEXT,
  summary TEXT,
  image_path TEXT,
  tag TEXT,
  kategori TEXT,
  created_by TEXT REFERENCES penmas_user(user_id),
  updated_by TEXT REFERENCES penmas_user(user_id),
  created_at TIMESTAMP DEFAULT NOW(),
  last_update TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS press_release_detail (
  event_id INTEGER PRIMARY KEY REFERENCES editorial_event(event_id),
  judul TEXT,
  dasar TEXT,
  tersangka TEXT,
  tkp TEXT,
  kronologi TEXT,
  modus TEXT,
  barang_bukti TEXT,
  pasal TEXT,
  ancaman TEXT,
  catatan TEXT
);

CREATE TABLE IF NOT EXISTS approval_request (
  request_id SERIAL PRIMARY KEY,
  event_id INTEGER REFERENCES editorial_event(event_id),
  requested_by TEXT REFERENCES penmas_user(user_id),
  status VARCHAR(20) DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS premium_request (
  request_id SERIAL PRIMARY KEY,
  user_id TEXT REFERENCES "user"(user_id),
  sender_name TEXT,
  account_number TEXT,
  bank_name TEXT,
  screenshot_url TEXT,
  status VARCHAR(20) DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS change_log (
  log_id SERIAL PRIMARY KEY,
  event_id INTEGER REFERENCES editorial_event(event_id),
  user_id TEXT REFERENCES penmas_user(user_id),
  status VARCHAR(20),
  changes TEXT,
  logged_at TIMESTAMP DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS login_log (
  log_id SERIAL PRIMARY KEY,
  actor_id TEXT,
  login_type VARCHAR(20),
  login_source VARCHAR(20),
  logged_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS saved_contact (
  phone_number VARCHAR PRIMARY KEY,
  resource_name VARCHAR,
  created_at TIMESTAMP DEFAULT NOW()
);
