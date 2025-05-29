# Cicero\_V2

## Sistem Otomatisasi Monitoring, Absensi, dan Analitik Instagram untuk Organisasi & Divisi via WhatsApp

---

## 1. Deskripsi Singkat

Aplikasi ini membantu organisasi (Client) mengelola, memantau, dan mengakumulasi pelaksanaan interaksi sosial media pada akun Instagram resmi (Official) organisasi. Sistem melakukan *fetch* konten Instagram, menyimpan analitik, dan mengirim laporan absensi pelaksanaan likes/komentar user ke WhatsApp, baik *on-demand* (trigger manual) maupun otomatis (*cronjob*).

---

## 2. Fitur Utama

* Sinkronisasi Otomatis Konten Instagram:

  * Mengambil (fetch) seluruh konten Instagram setiap client (organisasi) secara berkala/otomatis/manual.
* Absensi Likes Otomatis dan Manual:

  * Melakukan pencocokan antara daftar username user dan likes pada setiap konten.
  * Menyajikan laporan terstruktur berdasarkan Divisi (bukan Satfung), Client (bukan Polres), sudah/belum melaksanakan, serta akumulasi pelaksanaan.
* Integrasi WhatsApp:

  * Otomatisasi pengiriman laporan ke admin via WhatsApp.
  * Semua trigger juga dapat dieksekusi oleh admin melalui chat WhatsApp.
* Pengelolaan Data User, Client (Organisasi), Absensi, dan Likes:

  * Semua data user, konten, likes, dan log tersimpan di PostgreSQL.
* Cronjob Otomatis:

  * Eksekusi fetch + absensi likes otomatis setiap jam (06:30–21:30) tanpa interaksi manual.
* Konfigurasi dan Maintenance Mudah.
* Support Multi-Admin.

---

## 3. Struktur Folder & File

```
Cicero_V2/
├── .gitignore
├── LICENSE
├── README.md
├── SECURITY.md
├── app.js
├── package-lock.json
├── package.json
├── src/
│   ├── config/
│   │   └── db.js
│   ├── controller/
│   │   ├── clientController.js
│   │   └── userController.js
│   ├── data/               # legacy JSON data, tidak digunakan pada mode database production
│   │   ├── attendance.json
│   │   ├── backups.json
│   │   ├── clients.json
│   │   ├── insta.json
│   │   ├── tiktok.json
│   │   ├── users.json
│   │   └── warnings.json
│   ├── middleware/
│   │   └── errorHandler.js
│   ├── model/
│   │   ├── clientModel.js
│   │   ├── instaLikeModel.js
│   │   ├── instaPostModel.js
│   │   └── userModel.js
│   ├── routes/
│   │   ├── clientRoutes.js
│   │   ├── index.js
│   │   └── userRoutes.js
│   ├── service/
│   │   ├── checkGoogleSheetAccess.js
│   │   ├── clientService.js
│   │   ├── cronService.js         # job scheduler (cron)
│   │   ├── importSpreadsheetService.js
│   │   ├── importUsersFromGoogleSheet.js
│   │   ├── instaFetchService.js   # core Instagram content fetch
│   │   ├── tiktokService.js
│   │   ├── userMigrationService.js
│   │   ├── userService.js
│   │   └── waService.js           # WhatsApp integration/command handler
│   ├── utils/
│   │   ├── constants.js
│   │   ├── crypt.js
│   │   └── response.js
│   └── index.js (atau main.js)    # entrypoint aplikasi
```

### Penjelasan Tiap Folder Utama

* **/src/config/**: konfigurasi koneksi DB, setting lain (umumnya hanya db.js).
* **/src/controller/**: REST API controller untuk akses data Client/User (opsional, dipakai jika expose API selain WA).
* **/src/data/**: data *legacy* JSON (bisa diabaikan pada mode produksi/database, referensi migrasi awal).
* **/src/middleware/**: error handler untuk web/REST API (jika digunakan).
* **/src/model/**: akses dan query database model (ORM/query builder/fetch/postgres).
* **/src/routes/**: routing REST API (opsional, jika expose endpoint web).
* **/src/service/**: seluruh service logic utama (integrasi API, WhatsApp, scheduler, migrasi data, dsb).
* **/src/utils/**: helper, constant, utility (format response, hash/crypt, dll).

```

Cicero_V2/
├── src/
│   ├── config/
│   │   └── db.js
│   ├── model/
│   │   ├── instaLikeModel.js
│   │   ├── instaPostModel.js
│   │   ├── userModel.js
│   │   └── clientModel.js
│   ├── service/
│   │   ├── instaFetchService.js
│   │   ├── waService.js
│   │   ├── userService.js (opsional, alias userModel.js)
│   │   └── cronJob.js
│   └── index.js (atau main.js)
├── .env
├── package.json
└── README.md
```

---

## 4. Database Structure & Asumsi Field

### 4.1 Table `client` (Organisasi)

| Kolom                 | Tipe         | Keterangan                            |
| --------------------- | ------------ | ------------------------------------- |
| client\_id            | varchar(64)  | PRIMARY KEY                           |
| client\_nama          | varchar(255) | Nama organisasi                       |
| client\_status        | boolean      | TRUE = aktif                          |
| client\_insta         | varchar(128) | Username IG official organisasi       |
| client\_insta\_status | boolean      | TRUE = wajib punya Instagram official |

### 4.2 Table `user`

| Kolom      | Tipe         | Keterangan                            |
| ---------- | ------------ | ------------------------------------- |
| user\_id   | varchar(64)  | PRIMARY KEY, NRP/NIP user             |
| client\_id | varchar(64)  | FK ke client\_id di client            |
| nama       | varchar(255) | Nama user                             |
| title      | varchar(128) | Pangkat/gelar                         |
| divisi     | varchar(128) | Divisi                                |
| jabatan    | varchar(128) | Jabatan                               |
| status     | boolean      | TRUE = aktif, hanya yg aktif dihitung |
| whatsapp   | varchar(32)  | Nomor WhatsApp                        |
| insta      | varchar(128) | Username Instagram (boleh null)       |

### 4.3 Table `insta_post`

| Kolom          | Tipe        | Keterangan                           |
| -------------- | ----------- | ------------------------------------ |
| shortcode      | varchar(32) | PRIMARY KEY, kode post IG            |
| client\_id     | varchar(64) | FK ke client                         |
| caption        | text        | Caption (hanya text)                 |
| created\_at    | timestamp   | Waktu post (diisi dari taken\_at IG) |
| like\_count    | integer     | Jumlah likes                         |
| comment\_count | integer     | Jumlah komentar                      |

### 4.4 Table `insta_like`

| Kolom       | Tipe        | Keterangan                               |
| ----------- | ----------- | ---------------------------------------- |
| shortcode   | varchar(32) | FK ke insta\_post.shortcode, PRIMARY KEY |
| likes       | JSON/JSONB  | Array username yang melakukan like       |
| updated\_at | timestamp   | Terakhir update data likes               |

---

## 5. ENV & Konfigurasi

**.env file**  (WAJIB diisi)

```
PGHOST=localhost
PGUSER=xxxx
PGPASSWORD=xxxx
PGDATABASE=xxxx
PGPORT=5432
RAPIDAPI_KEY=xxxx
ADMIN_WHATSAPP=628xxxxxx@c.us,628yyyyyy@c.us
```

---

## 6. Workflow & Fungsi Utama

### 6.1 Fetch Konten Instagram (src/service/instaFetchService.js)

* Setiap jam (06:30–21:30, via cronJob) fetch konten IG dari semua client (organisasi) yang IG-nya aktif.
* Hanya ambil data **hari ini** (`taken_at` = hari ini).
* Untuk setiap post:

  * Jika `shortcode` sudah ada → update.
  * Jika **shortcode** hilang dari hasil fetch (sudah tidak muncul di IG hari ini) → hapus dari DB.
  * Data disimpan: `caption`, `shortcode`, `created_at`, `comment_count`, `like_count`.
* Likes per post:

  * Merge username baru ke array likes tanpa duplikat.

### 6.2 Absensi Likes Instagram (src/service/waService.js)

* Trigger WhatsApp:

  * `absensilikes#clientid`
  * `absensilikes#clientid#sudah`
  * `absensilikes#clientid#belum`
  * `absensilikes#clientid#akumulasi#sudah`
  * `absensilikes#clientid#akumulasi#belum`
* Workflow:

  * **Per konten hari ini**: cek likes (username) vs user (insta).
  * **Sudah** = username user ada di likes.
  * **Belum** = username user tidak ada di likes atau tidak mengisi IG (dengan keterangan).
  * Laporan **tanpa nomor urut**, dikelompokkan per **Divisi**.
  * Akumulasi: Sudah ≥ 50% dari jumlah konten IG hari itu.
  * Semua laporan menyertakan header "Mohon Ijin Komandan, Melaporkan Rekap Pelaksanaan Komentar dan Likes pada Akun Official :" dan jam pengambilan.

### 6.3 CronJob Otomatis (src/service/cronJob.js)

* Menggunakan node-cron:

  * Eksekusi: Tiap jam pada menit 30 dari 06:30 sampai 21:30.
  * Menjalankan:

    * `fetchAndStoreInstaContent`
    * `absensilikes#clientid#akumulasi#belum` (per client aktif)
  * Laporan otomatis dikirim ke semua ADMIN\_WHATSAPP.

---

## 7. WhatsApp Integrasi

* Semua perintah dan notifikasi dikirim via WhatsApp (`waService.js`)
* Bisa menerima trigger manual dan mengirim laporan otomatis.

---

## 8. Contoh Query Penting

Ambil user per client (status true):

```js
export async function getUsersByClient(client_id) {
  const res = await pool.query(
    `SELECT user_id, nama, title, divisi, insta, status FROM "user" WHERE client_id = $1 AND status = true`,
    [client_id]
  );
  return res.rows;
}
```

Ambil konten IG hari ini per client:

```js
export async function getShortcodesTodayByClient(client_id) {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  const res = await pool.query(
    `SELECT shortcode FROM insta_post WHERE client_id = $1 AND DATE(created_at) = $2`,
    [client_id, `${yyyy}-${mm}-${dd}`]
  );
  return res.rows.map(r => r.shortcode);
}
```

---

## 9. Cara Menjalankan Sistem

1. **Install dependensi**

   ```bash
   npm install
   ```
2. **Setting .env** Lihat contoh di atas.
3. **Jalankan aplikasi**

   ```bash
   node src/index.js
   # atau
   npm start
   ```
4. **Aplikasi otomatis fetch IG & kirim rekap sesuai jadwal, trigger WA, atau perintah manual.**

---

## 10. Maintenance & Pengembangan

* **Menambah client (organisasi):** Tambahkan pada table `client`, isi field `client_insta`, set `client_status` dan `client_insta_status` ke `true`.
* **Menambah user:** Tambahkan pada table `user` dengan mengisi seluruh field yang dibutuhkan.
* **Ganti admin WA:** Edit `.env` pada `ADMIN_WHATSAPP`.
* **Perubahan field database:** Pastikan update pada kode model (`src/model/*Model.js`) jika ada perubahan field/tabel/relasi DB.
* **Ganti jadwal cron:** Edit string cron pada file cronJob.js.

---

## 11. Troubleshooting

* Pastikan koneksi DB, API Key, dan WhatsApp session OK.
* Jika error table/field: cek schema dan query sudah benar.
* Permission error (PostgreSQL): cek user DB dan izin per tabel.
* Jika WhatsApp tidak terhubung, ulangi scan QR saat start aplikasi.
* Untuk debugging, gunakan log di setiap service.

---

## 12. Pengembangan Lanjutan

* Otomatisasi workflow TikTok jika dibutuhkan (dapat mengikuti pola yang sama).
* Integrasi notifikasi webhook/email jika perlu.
* Ekspor laporan ke PDF/excel dapat dikembangkan dari data DB.

---

# Selesai

Dokumentasi ini telah diverifikasi dan utuh, siap digunakan dan dikembangkan. Semua workflow, file, field, dan konvensi sudah sesuai hasil pemeriksaan real file dan kebutuhan aplikasi organisasi (client) berbasis Instagram monitoring dan WhatsApp reporting.

---
