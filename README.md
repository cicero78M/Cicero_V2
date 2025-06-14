
# CICERO_V2

## Deskripsi

**Cicero_V2** adalah sistem otomatisasi monitoring, absensi sosial media, dan analitik konten (Instagram & TikTok) untuk organisasi/institusi (Polri, humas, dsb).  
Sistem ini mendukung multi-client, rekap otomatis likes dan komentar, serta pengiriman laporan ke WhatsApp admin.

---

## Struktur Folder & Modul

```
Cicero_V2-main/
├── app.js                       # Entry point aplikasi
├── package.json                 # Konfigurasi NPM
├── src/
│   ├── config/
│   │   └── db.js                # Koneksi PostgreSQL
│   ├── controller/
│   │   ├── clientController.js  # CRUD data client
│   │   └── userController.js    # CRUD data user
│   ├── model/
│   │   ├── clientModel.js       # Model data client
│   │   ├── userModel.js         # Model data user
│   │   ├── instaLikeModel.js    # Model like IG
│   │   ├── instaPostModel.js    # Model post IG
│   │   ├── tiktokPostModel.js   # Model post TikTok
│   │   ├── tiktokCommentModel.js# Model komen TikTok
│   ├── service/
│   │   ├── cronService.js       # Jadwal otomatis (cron)
│   │   ├── instaFetchService.js # Fetch konten IG
│   │   ├── tiktokFetchService.js# Fetch TikTok
│   │   ├── waService.js         # Notifikasi WhatsApp
│   │   ├── clientService.js     # Utility client
│   │   └── checkGoogleSheetAccess.js # Cek akses Google Sheet
│   ├── routes/
│   │   ├── clientRoutes.js      # Endpoint client
│   │   ├── userRoutes.js        # Endpoint user
│   │   └── index.js             # Router utama
│   ├── middleware/
│   │   └── errorHandler.js      # Handler error global
│   └── data/
│       └── *.json               # Backup/legacy data
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
terkumpul kemudian difilter sehingga hanya tersisa data pada bulan
yang diminta.

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
    cd Cicero_V2-main
    npm install
    ```

2. **Konfigurasi .env:**
    ```ini
    DATABASE_URL=postgresql://user:pass@host:port/db
    ADMIN_WHATSAPP=628xxxxxx@c.us,628yyyyyy@c.us
    # Default operator untuk login frontend
    CLIENT_OPERATOR=628123456789
    # URL API backend (untuk dashboard/Next.js)
    NEXT_PUBLIC_API_URL=http://localhost:3000/api
    NEXT_PUBLIC_ADMIN_WHATSAPP=628xxxxxx@c.us
    NEXT_PUBLIC_CLIENT_OPERATOR=628123456789
    RAPIDAPI_KEY=xxxx
    REDIS_URL=redis://localhost:6379
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

---

## License

Lihat file LICENSE di repo.

---

## Kontributor & Support

Silakan hubungi admin repo untuk akses, issue, atau kontributor tambahan.

---

> Seluruh dokumentasi lanjutan dan SOP internal dapat merujuk README & hasil analisis di kanvas.  
> **Dokumentasi ini dihasilkan otomatis berdasarkan analisis kode dan kronologi pengembangan.**
