# REKAPITULASI & KRONOLOGI PROSES ANALISIS DAN DOKUMENTASI CICERO\_V2

## 0. Kronologi Proses (Dari Awal Sesi)

* **Pemeriksaan & Ekstraksi ZIP**: Source code diekstrak penuh, seluruh struktur folder/file dimapping.
* **Isi README.md awal dievaluasi**: Hanya mendokumentasikan sebagian fitur utama, belum TikTok, Google Sheet, utility/helper, dsb.
* **Verifikasi & Mapping Struktur**: Semua file/folder di-root dan di-src dicatat dan divisualisasikan.
* **Bedah Fungsi & Handler Per File**: Semua controller, model, service, route, dan middleware dianalisis, lalu fungsi & flow ditulis secara modular.
* **Penambahan Alamat File Pada Setiap Fungsi**: Semua detail fungsi & fitur diberi path file/folder, sehingga dokumentasi mudah ditelusuri kembali.
* **Pencatatan Segmentasi Modular**: Semua fitur utama (Client API, User API, Cron, WhatsApp, Absensi Like/Comment, TikTok, Google Sheet, Helper) didokumentasi per segmen, lengkap dengan contoh payload dan flow bisnis.
* **Deployment & Environment**: Prosedur setup .env, migrasi DB, backup/restore, dan pengujian endpoint.
* **Prosedur Praktis**: Migrasi DB (SQL), backup/restore, pengujian endpoint manual & otomatis.
* **Troubleshooting, Security, Scaling**: Troubleshooting umum, security best practice, dan tips scaling.
* **Setiap Segmen & Proses Dicatat ke Kanvas**: Semua langkah dan progres update didokumentasikan secara kronologis dan modular pada kanvas.

---

## 1. Analisis Struktur & Fungsi CICERO\_V2

### 1.1 Root & Config

* **app.js** — Entry point aplikasi
* **package.json**, **package-lock.json** — Konfigurasi dan dependensi npm
* **src/config/db.js** — Konfigurasi koneksi database

### 1.2 Controller (src/controller/)

* **clientController.js** (src/controller/clientController.js)

  * getAllClients, getClientById, createClient, updateClient, deleteClient
* **userController.js** (src/controller/userController.js)

  * getAllUsers, getUserById, createUser, updateUser, deleteUser

### 1.3 Model (src/model/)

* **clientModel.js** (src/model/clientModel.js): findAll, findById, create, update
* **userModel.js** (src/model/userModel.js): findAll, findById, create, update, remove (JSON), getUsersByClient (PostgreSQL)
* **instaLikeModel.js** (src/model/instaLikeModel.js): upsertInstaLike, getLikeUsernamesByShortcode, deleteInstaLikeByShortcode, getAllShortcodesToday, getLikesByShortcode
* **instaPostModel.js** (src/model/instaPostModel.js): upsertInstaPost, getShortcodesTodayByClient
* **tiktokPostModel.js** (src/model/tiktokPostModel.js): upsertTiktokPost, getPostsTodayByClient
* **tiktokCommentModel.js** (src/model/tiktokCommentModel.js): upsertTiktokComments, getCommentsByVideoId

### 1.4 Service (src/service/)

* **cronService.js** (src/service/cronService.js): getAdminWAIds, groupByDivision, getActiveClientsIG, absensiLikesAkumulasiBelum, penjadwalan cron IG/TikTok
* **instaFetchService.js** (src/service/instaFetchService.js): isToday, getShortcodesToday, deleteShortcodes, getEligibleClients, fetchAllLikes
* **tiktokFetchService.js** (src/service/tiktokFetchService.js): getAdminWAIds, isTodayEpoch, fetchCommentsTodayByClient
* **waService.js** (src/service/waService.js): isAdminWhatsApp, formatClientData, inisialisasi koneksi WA, helper notifikasi
* **clientService.js** (src/service/clientService.js): findAllClients, findClientById, createClient, updateClient, deleteClient, fetchTiktokSecUid, updateClientSecUid
* **checkGoogleSheetAccess.js** (src/service/checkGoogleSheetAccess.js): checkGoogleSheetCsvStatus

### 1.5 Routes (src/routes/)

* **clientRoutes.js** (src/routes/clientRoutes.js): GET / → clientController.getAllClients, GET /\:id → clientController.getClientById, POST / → clientController.createClient, PUT /\:id → clientController.updateClient, DELETE /\:id → clientController.deleteClient
* **userRoutes.js** (src/routes/userRoutes.js): GET / → userController.getAllUsers, GET /\:id → userController.getUserById, POST / → userController.createUser, PUT /\:id → userController.updateUser, DELETE /\:id → userController.deleteUser
* **index.js** (src/routes/index.js): Menggabungkan seluruh routes utama

### 1.6 Middleware (src/middleware/)

* **errorHandler.js** (src/middleware/errorHandler.js): notFound, errorHandler

### 1.7 Data (src/data/)

* File JSON: attendance.json, backups.json, clients.json, insta.json, tiktok.json, users.json, warnings.json

---

## 2. Dokumentasi Modular

### 2.1 Client API (src/routes/clientRoutes.js, src/controller/clientController.js)

**Endpoint & Handler**

| Endpoint       | Method | Handler       | Deskripsi            |
| -------------- | ------ | ------------- | -------------------- |
| `/clients`     | GET    | getAllClients | Ambil seluruh client |
| `/clients/:id` | GET    | getClientById | Ambil detail client  |
| `/clients`     | POST   | createClient  | Tambah client baru   |
| `/clients/:id` | PUT    | updateClient  | Update client        |
| `/clients/:id` | DELETE | deleteClient  | Hapus client         |

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

### 2.2 User API (src/routes/userRoutes.js, src/controller/userController.js)

**Endpoint & Handler**

| Endpoint     | Method | Handler     | Deskripsi          |
| ------------ | ------ | ----------- | ------------------ |
| `/users`     | GET    | getAllUsers | Ambil seluruh user |
| `/users/:id` | GET    | getUserById | Ambil detail user  |
| `/users`     | POST   | createUser  | Tambah user baru   |
| `/users/:id` | PUT    | updateUser  | Update user        |
| `/users/:id` | DELETE | deleteUser  | Hapus user         |

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

### 2.3 Penjadwalan Cron & Otomasi (src/service/cronService.js)

* Otomatis fetch konten IG & TikTok, absensi likes/komentar, dan kirim laporan ke WhatsApp admin.
* Jadwal cron: 06:30–21:30 tiap hari (atau sesuai konfigurasi).
* Semua task bisa dijalankan manual via WA oleh admin.

### 2.4 WhatsApp Service (src/service/waService.js)

* Bot WhatsApp otomatis kirim rekap absensi dan status fetch ke admin/group.
* Hanya admin yang terdaftar di ENV yang dapat trigger perintah manual.
* Koneksi via QR code (whatsapp-web.js).
* Semua rekap bisa dipicu manual via perintah di chat WA.

### 2.5 Absensi Like & Komentar Sosial Media (src/model/instaLikeModel.js, src/model/tiktokCommentModel.js)

* Absensi likes IG: bandingkan user terdaftar dengan array likes pada posting IG hari ini.
* Absensi komentar TikTok: bandingkan user terdaftar dengan array komentar pada video TikTok hari ini.
* Laporan otomatis dikirim ke WA, bisa di-trigger manual.
* Semua data historis dapat diakses dan digenerate ulang oleh admin.

### 2.6 Modul TikTok (src/model/tiktokPostModel.js, src/model/tiktokCommentModel.js, src/service/tiktokFetchService.js)

* Pengambilan posting & komentar TikTok otomatis/manual per client.
* Mapping komentar user untuk absensi.
* Semua data TikTok (post & komentar) tersimpan di tabel DB.

### 2.7 Integrasi Google Sheet (src/service/checkGoogleSheetAccess.js)

* Untuk import data user/client massal via Google Sheet.
* Pastikan sheet bisa diakses publik (Anyone with the link can view).
* Fitur check akses sheet otomatis, instruksi jika tidak valid.

### 2.8 Utility & Helper (src/service/waService.js, src/service/cronService.js)

* Helper validasi admin WA, format pesan, response API standar, dsb.
* Seluruh helper bisa di-extend di service masing-masing.

---

## 3. Deployment & Environment

* Clone repo & install:

```bash
git clone <repo-url>
cd Cicero_V2-main
npm install
```

* Konfigurasi .env:

```ini
DATABASE_URL=postgresql://user:pass@host:port/db
ADMIN_WHATSAPP=628xxxxxx@c.us,628yyyyyy@c.us
RAPIDAPI_KEY=xxxx
```

* Setup DB: migrasikan semua tabel (lihat bagian migrasi DB di bawah).
* Jalankan aplikasi:

```bash
npm start
```

atau dengan PM2:

```bash
pm2 start app.js --name cicero_v2
```

---

## 4. Migrasi Database (Contoh Struktur Tabel)

```sql
CREATE TABLE clients (...);
CREATE TABLE "user" (...);
CREATE TABLE insta_post (...);
CREATE TABLE insta_like (...);
CREATE TABLE tiktok_post (...);
CREATE TABLE tiktok_comment (...);
```

(Lihat detail di dokumentasi kanvas/segmen migrasi DB)

---

## 5. Backup & Restore

* Backup DB:

```bash
pg_dump -U <dbuser> -h <host> -d <dbname> > cicero_backup.sql
```

* Restore DB:

```bash
psql -U <dbuser> -h <host> -d <dbname> < cicero_backup.sql
```

---

## 6. Pengujian Endpoint

* Gunakan Postman/curl:

```bash
curl -X GET http://localhost:3000/clients
curl -X POST http://localhost:3000/users -H 'Content-Type: application/json' -d '{"nama":"Budi","client_id":"polres_x"}'
```

* Untuk pengujian otomatis, dapat gunakan Mocha/Jest (lihat contoh di dokumentasi lanjutan).

---

## 7. Troubleshooting

* Koneksi DB error: cek DATABASE\_URL, status PostgreSQL.
* WhatsApp tidak terhubung: scan QR ulang, cek session.
* API eksternal error: cek RAPIDAPI\_KEY, status RapidAPI, log aplikasi.
* Cron tidak jalan: cek node-cron, timezone, ENV.

---

## 8. Security

* Jangan pernah upload .env ke repo publik.
* Semua endpoint POST/PUT divalidasi ketat.
* Admin WhatsApp hanya dari ENV.
* Backup DB rutin dan recovery test.

---

## 9. Scaling & Monitoring

* Gunakan PM2 cluster, pisah proses jika beban tinggi.
* Tambahkan monitoring health DB, cron, dan log WhatsApp.
* Optimasi DB dengan index pada field utama.

---

## 10. License & Support

* Lihat file LICENSE di repo.
* Hubungi admin repo untuk akses, issue, atau kontributor tambahan.
* Semua dokumentasi lanjutan dan SOP internal bisa merujuk pada isi README & kanvas.

---

**Seluruh isi ini adalah hasil rekonstruksi, verifikasi, dan rekap percakapan analisis kode project Cicero\_V2 — siap digunakan sebagai README atau basis dokumentasi permanen project.**
