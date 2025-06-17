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
