# CICERO_V2
*Last updated: 2026-03-01*

## Deskripsi

**Cicero_V2** adalah sistem otomatisasi monitoring, absensi sosial media, dan analitik konten (Instagram & TikTok) untuk organisasi/institusi (Polri, humas, dsb).  
Sistem ini mendukung multi-client, rekap otomatis likes dan komentar, serta pengiriman laporan ke WhatsApp admin.

Dokumentasi arsitektur lengkap tersedia pada [docs/enterprise_architecture.md](docs/enterprise_architecture.md).
Dokumentasi jadwal aktivitas sistem terdapat pada [docs/activity_schedule.md](docs/activity_schedule.md).
Dokumentasi alur metadata tersedia pada [docs/metadata_flow.md](docs/metadata_flow.md).
Panduan migrasi server tersedia pada [docs/server_migration.md](docs/server_migration.md).
Panduan penggunaan RabbitMQ tersedia pada [docs/rabbitmq.md](docs/rabbitmq.md).
Dokumentasi penggunaan Redis tersedia pada [docs/redis.md](docs/redis.md).
Dokumentasi struktur tabel database ada di [docs/database_structure.md](docs/database_structure.md).
Contoh konfigurasi Nginx dapat dilihat pada [docs/reverse_proxy_config.md](docs/reverse_proxy_config.md).
Panduan backup PostgreSQL otomatis tersedia pada [docs/pg_backup_gdrive.md](docs/pg_backup_gdrive.md).
Petunjuk gaya penamaan kode berada pada [docs/naming_conventions.md](docs/naming_conventions.md).

## Prasyarat
- Node.js 20 atau lebih baru
- PostgreSQL dan Redis (sesuaikan `.env`)
- Jalankan `npm install` sebelum memulai

---
## Struktur Folder & Modul

```
Cicero_V2/
├── app.js                       # Entry point aplikasi
├── package.json                 # Konfigurasi NPM
├── src/
│   ├── config/
│   │   ├── env.js              # Konfigurasi ENV menggunakan envalid
│   │   └── redis.js            # Klien Redis
│   ├── db/
│   │   ├── index.js           # Adapter database
│   │   ├── postgres.js        # Helper PostgreSQL
│   │   ├── mysql.js           # Helper MySQL
│   │   └── sqlite.js          # Helper SQLite
│   ├── controller/
│   │   ├── clientController.js      # CRUD data client
│   │   ├── userController.js        # CRUD data user
│   │   ├── instaController.js       # Endpoint Instagram
│   │   ├── tiktokController.js      # Endpoint TikTok
│   │   ├── dashboardController.js   # Statistik dashboard
│   │   ├── oauthController.js       # OAuth callback
│   │   ├── metaController.js        # Metadata API
│   │   └── socialMediaController.js # Helper media sosial
│   ├── model/
│   │   ├── clientModel.js           # Model data client
│   │   ├── userModel.js             # Model data user
│   │   ├── instaLikeModel.js        # Model like IG
│   │   ├── instaPostModel.js        # Model post IG
│   │   ├── instaPostExtendedModel.js# Ekstensi metadata IG
│   │   ├── instaPostMetricsModel.js # Statistik IG
│   │   ├── instaPostCacheModel.js   # Cache posting IG
│   │   ├── instaCommentModel.js     # Komentar IG
│   │   ├── igPostLikeUserModel.js   # Mapping like IG
│   │   ├── igPostCommentModel.js    # Mapping komentar IG
│   │   ├── instaProfileModel.js     # Profil IG
│   │   ├── instagramUserModel.js    # Profil detail IG
│   │   ├── tiktokPostModel.js       # Model post TikTok
│   │   ├── tiktokCommentModel.js    # Model komen TikTok
│   │   └── visitorLogModel.js       # Log kunjungan dashboard
│   ├── cron/
│   │   ├── cronInstaService.js              # Fetch IG tiap jam
│   │   ├── cronTiktokService.js             # Fetch TikTok tiap jam
│   │   ├── cronInstaLaphar.js               # Laporan harian IG
│   │   ├── cronTiktokLaphar.js              # Laporan harian TikTok
│   │   ├── cronNotifikasiLikesDanKomentar.js# Pengingat via WA
│   │   └── cronInstaDataMining.js           # Data mining IG 23:40
│   ├── handler/                  # Logic menu WhatsApp & fetch
│   ├── service/
│   │   ├── instaRapidService.js      # Akses RapidAPI Instagram
│   │   ├── tiktokRapidService.js     # Akses RapidAPI TikTok
│   │   ├── instagramApi.js           # Wrapper API IG
│   │   ├── tiktokApi.js              # Wrapper API TikTok
│   │   ├── instaPostService.js       # Simpan posting IG
│   │   ├── tiktokPostService.js      # Simpan posting TikTok
│   │   ├── instaLikeService.js       # Simpan like IG
│   │   ├── tiktokCommentService.js   # Simpan komentar TikTok
│   │   ├── instaProfileService.js    # Simpan profil IG
│   │   ├── instagramUserService.js   # Simpan detail IG
│   │   ├── instaPostCacheService.js  # Cache posting IG
│   │   ├── profileCacheService.js    # Cache profil
│   │   ├── importSpreadsheetService.js   # Helper import sheet
│   │   ├── importUsersFromGoogleSheet.js # Import user dari sheet
│   │   ├── clientService.js          # Utility client
│   │   ├── waService.js              # Notifikasi WhatsApp
│   │   ├── rabbitMQService.js        # Queue asynchronous
│   │   └── userMigrationService.js   # Migrasi user
│   ├── repository/
│   │   └── db.js                # Helper query DB
│   ├── utils/                   # Fungsi utilitas
│   ├── routes/
│   │   ├── authRoutes.js        # Login/Logout
│   │   ├── oauthRoutes.js       # Callback OAuth
│   │   ├── clientRoutes.js      # Endpoint client
│   │   ├── userRoutes.js        # Endpoint user
│   │   ├── instaRoutes.js       # Endpoint Instagram
│   │   ├── tiktokRoutes.js      # Endpoint TikTok
│   │   ├── dashboardRoutes.js   # Endpoint dashboard
│   │   ├── logRoutes.js         # Endpoint log
│   │   ├── metaRoutes.js        # Metadata API
│   │   └── index.js             # Router utama
│   ├── middleware/
│   │   ├── authMiddleware.js        # Middleware auth
│   │   ├── dedupRequestMiddleware.js# Cegah request duplikat
│   │   ├── debugHandler.js         # Debug logger
│   │   └── errorHandler.js         # Handler error global
```

---

## API Endpoint

### 1. Client API

| Endpoint        | Method | Handler        | Deskripsi           |
|-----------------|--------|---------------|---------------------|
| `/clients`      | GET    | getAllClients | Ambil seluruh client|
| `/clients/:id`  | GET    | getClientById | Ambil detail client |
| `/clients`      | POST   | createClient  | Tambah client baru  |
| `/clients/:id`  | PUT    | updateClient  | Update client       |
| `/clients/:id`  | DELETE | deleteClient  | Hapus client        |

**Contoh Response:**
```json
[
  {
    "client_id": "polres_x",
    "nama": "Polres X",
    "client_type": "Organisasi",
    "client_status": true
  }
]
```

### 2. User API

| Endpoint      | Method | Handler      | Deskripsi         |
|---------------|--------|-------------|-------------------|
| `/users`      | GET    | getAllUsers | Ambil seluruh user|
| `/users/:id`  | GET    | getUserById | Ambil detail user |
| `/users`      | POST   | createUser  | Tambah user baru  |
| `/users/:id`  | PUT    | updateUser  | Update user       |
| `/users/:id`  | DELETE | deleteUser  | Hapus user        |

**Contoh Response:**
```json
[
  {
    "id": 12345,
    "nama": "Budi",
    "title": "Bripka",
    "divisi": "Humas",
    "insta": "budi_polresx",
    "tiktok": "budi_humas",
    "client_id": "polres_x",
    "status": true
  }
]
```

### 3. Instagram Rapid API

| Endpoint | Method | Deskripsi |
|----------|--------|-----------|
| `/insta/rapid-profile` | GET | Ambil profil Instagram via RapidAPI |
| `/insta/rapid-posts`   | GET | Ambil postingan Instagram via RapidAPI |
| `/insta/profile`       | GET | Ambil profil Instagram dari database |

Fungsi utilitas `fetchInstagramPostsByMonthToken(username, bulan, tahun)`
tersedia pada kode untuk mengambil seluruh postingan bulan tertentu
dengan memanfaatkan parameter `pagination_token` dari RapidAPI.
Pengambilan data akan berhenti ketika sudah ditemukan posting
dengan tanggal di luar rentang bulan yang diminta.
Hal ini karena data dari RapidAPI sudah diurutkan dari yang terbaru
sehingga setelah ada tanggal lebih lama, tidak ada lagi posting
dari bulan tersebut di halaman selanjutnya. Semua posting yang
terkumpul dari setiap halaman kemudian digabung dan difilter sehingga
semua data pada bulan yang diminta dapat masuk ke dalam daftar.
Jika `bulan` atau `tahun` tidak diberikan, fungsi otomatis mengambil
postingan pada bulan dan tahun berjalan. Setiap permintaan paginasi
ditunda selama 1.5 detik untuk menghindari batasan API.

### 4. TikTok API

| Endpoint | Method | Deskripsi |
|----------|--------|-----------|
| `/tiktok/comments` | GET | Ambil komentar TikTok dari database |
| `/tiktok/rekap-komentar` | GET | Rekap absensi komentar TikTok |
| `/tiktok/posts` | GET | Ambil postingan TikTok dari database |
| `/tiktok/rapid-profile` | GET | Profil TikTok via RapidAPI |
| `/tiktok/rapid-posts` | GET | Postingan TikTok via RapidAPI |
| `/tiktok/rapid-info`  | GET | Info akun TikTok via RapidAPI |

### 5. OAuth Callback

| Endpoint          | Method | Deskripsi                                          |
|-------------------|--------|----------------------------------------------------|
| `/oauth/callback` | GET    | Callback URL setelah proses OAuth dari provider |

Endpoint ini menerima parameter `code` dan `state` dari penyedia OAuth.
Saat ini fungsinya hanya mencatat parameter tersebut, tetapi dapat
diperluas untuk menukar kode menjadi access token.

### 6. Instagram Data Mining

Struktur data untuk otomasi pencarian akun IG menggunakan konvensi
`polda_polres` dengan primary key `nama_polda`. Contoh data dapat
ditemukan pada berkas `polda_polres.json` (opsional).

Proses lengkap dijalankan lewat menu WhatsApp `clientrequest`
dengan memilih *Instagram Data Mining*.

### 7. Metadata API

| Endpoint    | Method | Deskripsi                               |
|-------------|--------|-----------------------------------------|
| `/metadata` | GET    | Menampilkan informasi versi aplikasi API |

**Contoh Response:**
```json
{
  "name": "cicero-clean-build",
  "version": "1.0.0",
  "description": "Cicero V2 with postgresql",
  "uptime": 123.456
}
```

### 9. Event Notifikasi

| Endpoint      | Method | Deskripsi                                                |
|---------------|--------|----------------------------------------------------------|
| `/auth/login` | POST   | Login client (sukses atau gagal) akan memicu notifikasi WhatsApp |
| `/auth/open`  | GET    | Dipanggil saat dashboard dibuka untuk pemberitahuan WA   |

### 10. Visitor Log API

| Endpoint | Method | Deskripsi |
|----------|--------|-----------|
| `/logs/visitors` | GET | Ambil daftar log kunjungan dashboard |

---

## Fitur & Flow Bisnis Utama

- **Penjadwalan Cron & Otomasi**  
  Otomatis fetch konten IG & TikTok, absensi likes/komentar, dan kirim laporan ke WhatsApp admin.  
  Jadwal cron: 06:30–21:30 tiap hari (atau sesuai konfigurasi).  
  Semua task bisa dijalankan manual via WA oleh admin.

- **WhatsApp Service**
  Bot WhatsApp otomatis kirim rekap absensi dan status fetch ke admin/group.
  Hanya admin di ENV yang bisa trigger perintah manual.
  Koneksi via QR code (whatsapp-web.js).
  Semua rekap bisa dipicu manual via perintah chat WA.
  Backend juga mengirim pesan ke admin setiap kali ada percobaan login (berhasil ataupun gagal) serta ketika halaman dashboard dibuka.

- **Absensi Like & Komentar Sosial Media**  
  Absensi likes IG: bandingkan user terdaftar dengan likes posting IG hari ini.  
  Absensi komentar TikTok: bandingkan user terdaftar dengan komentar video TikTok hari ini.  
  Laporan otomatis dikirim ke WA, bisa di-trigger manual.  
  Semua data historis bisa diakses/digenerate ulang oleh admin.

- **Modul TikTok**  
  Fetch posting & komentar TikTok otomatis/manual per client.  
  Mapping komentar user untuk absensi.  
  Semua data TikTok tersimpan di tabel DB.

- **Integrasi Google Sheet**  
  Import data user/client massal via Google Sheet.  
  Sheet harus publik ("Anyone with the link can view").  
  Fitur cek akses sheet otomatis, instruksi jika tidak valid.

---

## Deployment & Environment

1. **Clone repo & install:**
    ```bash
    git clone <repo-url>
    cd Cicero_V2
    npm install
    ```

2. **Konfigurasi .env:**
    ```ini
    PORT=3000
    DB_USER=cicero
    DB_HOST=localhost
    DB_NAME=cicero_db
    DB_PASS=secret
    DB_PORT=5432
    DB_DRIVER=postgres
    ADMIN_WHATSAPP=628xxxxxx@c.us,628yyyyyy@c.us
    # Default operator untuk login frontend
    CLIENT_OPERATOR=628123456789
    # URL API backend (untuk dashboard/Next.js)
    NEXT_PUBLIC_API_URL=http://localhost:3000/api
    NEXT_PUBLIC_ADMIN_WHATSAPP=628xxxxxx@c.us
    NEXT_PUBLIC_CLIENT_OPERATOR=628123456789
    RAPIDAPI_KEY=xxxx
    REDIS_URL=redis://localhost:6379
    SECRET_KEY=your-secret
    JWT_SECRET=your-jwt-secret
    AMQP_URL=amqp://localhost
    ```

    Untuk login dashboard, Anda dapat menggunakan nomor operator masing-masing
    atau salah satu nomor pada `ADMIN_WHATSAPP`. Cukup isi `client_id` yang ada
    dan masukkan nomor admin tersebut pada kolom WhatsApp. Saat ini tidak ada
    batas jumlah sesi login aktif per `client_id`.

3. **Install Redis:**
    ```bash
    sudo apt-get install redis-server
    sudo systemctl enable redis-server
    sudo systemctl start redis-server
    ```

4. **Setup DB:** migrasikan semua tabel (lihat bagian migrasi DB di bawah).

5. **Jalankan aplikasi:**
    ```bash
    npm start
    ```
    atau dengan PM2:
    ```bash
    pm2 start app.js --name cicero_v2
    ```

---

## Migrasi Database (Struktur Tabel Contoh)

Semua perintah `CREATE TABLE` di bawah juga tersedia pada file
[`sql/schema.sql`](sql/schema.sql). Jalankan dengan `psql -f sql/schema.sql`
untuk membuat seluruh tabel sekaligus.

```sql
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
  thumbnail_url TEXT,
  is_video BOOLEAN DEFAULT FALSE,
  video_url TEXT,
  image_url TEXT,
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

-- Log kunjungan dashboard
CREATE TABLE visitor_logs (
  id SERIAL PRIMARY KEY,
  ip VARCHAR,
  user_agent TEXT,
  visited_at TIMESTAMP DEFAULT NOW()
);
```

---

## Backup & Restore Database

- **Backup:**
    ```bash
    pg_dump -U <dbuser> -h <host> -d <dbname> > cicero_backup.sql
    ```
- **Restore:**
    ```bash
    psql -U <dbuser> -h <host> -d <dbname> < cicero_backup.sql
    ```

---

## Pengujian Endpoint

- **Manual:**  
  Gunakan Postman/curl:
    ```bash
    curl -X GET http://localhost:3000/clients
    curl -X POST http://localhost:3000/users -H 'Content-Type: application/json' -d '{"nama":"Budi","client_id":"polres_x"}'
    ```
- **Otomatis:**
  Dapat menggunakan Mocha/Jest (lihat dokumentasi lanjutan/test).
  Jalankan `npm test` untuk menjalankan suite Jest bawaan.

---

## Troubleshooting

- Koneksi DB error: cek `DATABASE_URL`, status PostgreSQL.
- WhatsApp tidak terhubung: scan QR ulang, cek session folder.
- API eksternal error: cek `RAPIDAPI_KEY`, status RapidAPI, dan log aplikasi.
- Cron tidak jalan: cek node-cron, timezone, ENV.

---

## Security

- Jangan upload `.env` ke repo publik.
- Semua endpoint POST/PUT divalidasi ketat.
- Admin WhatsApp hanya dari ENV.
- Backup DB rutin dan recovery test.

---

## Scaling & Monitoring

- Gunakan PM2 cluster, pisah proses jika beban tinggi.
- Tambahkan monitoring health DB, cron, dan log WhatsApp.
- Optimasi DB dengan index pada field utama.
- Cache profil Instagram dan TikTok di Redis (`profileCacheService.js`) untuk mempercepat respons.

## High Volume Queue (RabbitMQ)

- Untuk memproses pekerjaan berjumlah besar secara asinkron gunakan RabbitMQ.
- Atur URL koneksi pada variabel `AMQP_URL` di `.env`.
- Service queue tersedia di `src/service/rabbitMQService.js` dengan fungsi
  `publishToQueue` dan `consumeQueue`.

---

## License

Lihat file LICENSE di repo.

---

## Kontributor & Support

Silakan hubungi admin repo untuk akses, issue, atau kontributor tambahan.

---

> Seluruh dokumentasi lanjutan dan SOP internal dapat merujuk README & hasil analisis di kanvas.  
> **Dokumentasi ini dihasilkan otomatis berdasarkan analisis kode dan kronologi pengembangan.**

