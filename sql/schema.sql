CREATE TABLE clients (
  client_id VARCHAR PRIMARY KEY,
  nama VARCHAR NOT NULL,
  client_type VARCHAR,
  client_status BOOLEAN DEFAULT TRUE,
  client_insta VARCHAR,
  client_insta_status BOOLEAN DEFAULT TRUE,
  client_tiktok VARCHAR,
  client_tiktok_status BOOLEAN DEFAULT TRUE,
  client_operator VARCHAR,
  client_group VARCHAR,
  tiktok_secuid VARCHAR,
  client_super VARCHAR
);

CREATE TABLE "user" (
  user_id SERIAL PRIMARY KEY,
  nama VARCHAR,
  title VARCHAR,
  divisi VARCHAR,
  insta VARCHAR,
  tiktok VARCHAR,
  client_id VARCHAR REFERENCES clients(client_id),
  status BOOLEAN DEFAULT TRUE
);

CREATE TABLE insta_post (
  shortcode VARCHAR PRIMARY KEY,
  client_id VARCHAR REFERENCES clients(client_id),
  caption TEXT,
  comment_count INT,
  created_at TIMESTAMP
);

CREATE TABLE insta_like (
  shortcode VARCHAR PRIMARY KEY REFERENCES insta_post(shortcode),
  likes JSONB,
  updated_at TIMESTAMP
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

-- Cache hasil fetch posting Instagram per username
CREATE TABLE insta_post_cache (
  id SERIAL PRIMARY KEY,
  username VARCHAR NOT NULL,
  posts JSONB,
  fetched_at TIMESTAMP DEFAULT NOW()
);

-- Daftar akun Instagram Polres (validasi posting 3 hari terakhir)
CREATE TABLE polres_insta (
  username VARCHAR PRIMARY KEY,
  last_post_at TIMESTAMP,
  checked_at TIMESTAMP DEFAULT NOW()
);

-- Data Polda dan Kota
CREATE TABLE polda (
  id SERIAL PRIMARY KEY,
  nama VARCHAR UNIQUE NOT NULL
);

CREATE TABLE polda_kota (
  id SERIAL PRIMARY KEY,
  polda_id INTEGER REFERENCES polda(id),
  nama VARCHAR NOT NULL,
  UNIQUE(polda_id, nama)
);

-- Hasil pencarian akun Instagram
CREATE TABLE insta_user_search (
  id SERIAL PRIMARY KEY,
  username VARCHAR UNIQUE NOT NULL,
  full_name VARCHAR,
  instagram_id VARCHAR,
  is_private BOOLEAN,
  is_verified BOOLEAN,
  profile_pic_url TEXT,
  searched_at TIMESTAMP DEFAULT NOW()
);

-- Instagram data tables
-- Tabel utama dengan informasi profil dasar
CREATE TABLE instagram_user (
    user_id                 VARCHAR(30) PRIMARY KEY,
    username                VARCHAR(100) NOT NULL,
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

-- Data "About" dari profil
CREATE TABLE instagram_user_about (
    user_id                 VARCHAR(30) PRIMARY KEY REFERENCES instagram_user(user_id),
    country                 VARCHAR(100),
    date_joined             VARCHAR(50),
    date_joined_timestamp   BIGINT,
    former_usernames        INT
);

-- Link pada bio (bisa lebih dari satu per pengguna)
CREATE TABLE instagram_bio_link (
    user_id                 VARCHAR(30) REFERENCES instagram_user(user_id),
    link_id                 BIGINT,
    link_type               VARCHAR(30),
    lynx_url                TEXT,
    open_in_app             BOOLEAN,
    title                   VARCHAR(255),
    url                     TEXT,
    is_pinned               BOOLEAN,
    PRIMARY KEY (user_id, link_id)
);

-- Versi foto profil HD (bisa lebih dari satu per pengguna)
CREATE TABLE instagram_profile_pic_version (
    user_id                 VARCHAR(30) REFERENCES instagram_user(user_id),
    height                  INT,
    width                   INT,
    url                     TEXT,
    PRIMARY KEY (user_id, url)
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

-- Data lokasi akun (jika tersedia)
CREATE TABLE instagram_user_location (
    user_id                 VARCHAR(30) PRIMARY KEY REFERENCES instagram_user(user_id),
    address_street          VARCHAR(255),
    city_id                 VARCHAR(50),
    city_name               VARCHAR(100),
    instagram_location_id   VARCHAR(50),
    latitude                DOUBLE PRECISION,
    longitude               DOUBLE PRECISION,
    zip                     VARCHAR(20)
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
    post_id VARCHAR(50) REFERENCES ig_ext_posts(post_id),
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
    media_id VARCHAR(50) REFERENCES ig_ext_media_items(media_id),
    user_id VARCHAR(50) REFERENCES ig_ext_users(user_id),
    x REAL,
    y REAL,
    PRIMARY KEY (media_id, user_id)
);

CREATE TABLE IF NOT EXISTS ig_ext_hashtags (
    post_id VARCHAR(50) REFERENCES ig_ext_posts(post_id),
    hashtag VARCHAR(100),
    PRIMARY KEY (post_id, hashtag)
);

CREATE TABLE visitor_logs (
    id SERIAL PRIMARY KEY,
    ip VARCHAR,
    user_agent TEXT,
    visited_at TIMESTAMP DEFAULT NOW()
);
