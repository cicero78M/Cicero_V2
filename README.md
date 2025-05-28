# Cicero\_V2 WhatsApp Bot System

Sistem WA bot untuk manajemen data client organisasi,
sinkronisasi data client & user (termasuk migrasi user terenkripsi dari JSON ke PostgreSQL),
serta integrasi data TikTok secUid berbasis API.
Struktur modular, mudah di-maintain dan scalable.

---

## **Fitur Utama**

* CRUD data client (via WhatsApp command)
* CRUD dan migrasi user per client (file JSON ke database, Google Spreadsheet ke database)
* Semua data terenkripsi (AES), dekripsi otomatis
* Integrasi TikTok secUid via RapidAPI
* Notifikasi otomatis ke nomor operator/client\_super
* Absensi user per client (INSTAGRAM & TIKTOK, sudah/belum) langsung via WhatsApp
* Semua fitur via WhatsApp Web Bot (wweb.js)
* Database PostgreSQL dengan struktur table modular
* Error handling & padding data otomatis
* **Seluruh request WhatsApp hanya dapat diakses nomor yang terdaftar di variabel `ADMIN_WHATSAPP` pada file `.env`**

---

## **Struktur Project**

```
Cicero_V2/
├── src/
│   ├── config/
│   │   └── db.js                  # Koneksi PostgreSQL
│   ├── controller/
│   │   └── clientController.js    # (opsional, jika ada endpoint REST)
│   ├── model/
│   │   └── clientModel.js         # Query data client
│   ├── service/
│   │   ├── waService.js           # Handler utama WA Bot & logic command
│   │   ├── clientService.js       # Logic data client (CRUD)
│   │   ├── userMigrationService.js# Migrasi user JSON terenkripsi ke DB
│   │   ├── importUsersFromGoogleSheet.js # Migrasi user dari Google Sheet
│   │   └── tiktokService.js       # Ambil secUid TikTok via API
│   ├── util/
│   │   └── crypt.js               # Encrypt/decrypt data (CryptoJS, passphrase)
│   └── ...
├── user_data/
│   └── [CLIENT_ID]/*.json         # File user per client terenkripsi
├── .env                           # Env vars (DB, SECRET_KEY, ADMIN_WHATSAPP, dll)
├── app.js                         # Entry point (jika ada)
├── package.json
└── README.md                      # (file ini)
```

---

## **Konfigurasi Environment (.env)**

Contoh:

```
PGUSER=your_db_user
PGPASSWORD=your_db_password
PGDATABASE=your_db_name
PGHOST=localhost
PGPORT=5432

SECRET_KEY=passphrase_rahasia_anda
RAPIDAPI_KEY=isi_key_rapidapi

# Daftar nomor admin (format WhatsApp, tanpa tanda plus, bisa koma)
ADMIN_WHATSAPP=6281234567890,6285678901234
```

---

## **Database**

### **Table: clients**

```sql
CREATE TABLE clients (
  client_id        VARCHAR PRIMARY KEY,
  nama             VARCHAR,
  client_type      VARCHAR,
  client_status    BOOLEAN DEFAULT FALSE,
  client_insta     VARCHAR,
  client_insta_status BOOLEAN DEFAULT FALSE,
  client_tiktok    VARCHAR,
  client_tiktok_status BOOLEAN DEFAULT FALSE,
  client_operator  VARCHAR,
  client_super     VARCHAR,
  client_group     VARCHAR,
  tiktok_secUid    VARCHAR
);
```

### **Table: user**

```sql
CREATE TABLE "user" (
  user_id      VARCHAR(8) PRIMARY KEY,
  nama         VARCHAR,
  title        VARCHAR,
  divisi       VARCHAR,
  jabatan      VARCHAR,
  status       BOOLEAN DEFAULT FALSE,
  whatsapp     VARCHAR,
  insta        VARCHAR,
  tiktok       VARCHAR,
  exception    BOOLEAN DEFAULT FALSE,
  client_id    VARCHAR
);
```

---

## **Alur Logika & Fungsi Utama**

### **A. WA Bot (waService.js)**

* **Menerima pesan WA** (wweb.js)
* Parsing perintah (`addnewclient#`, `updateclient#`, `removeclient#`, dll)
* Validasi, update/insert ke DB, balas info ke pengirim & operator
* Handler `clientrequest` untuk bantuan command
* Handler `transferuser#clientid` untuk migrasi user (otomatis dari file JSON ke DB)
* Handler `sheettransfer#clientid#link_google_sheet` untuk migrasi user dari Google Sheet
* Handler absensi user per client (requestinsta#/requesttiktok#)
* **Semua request WA hanya bisa diakses nomor admin sesuai variabel .env**

### **B. Migrasi User (userMigrationService.js & importUsersFromGoogleSheet.js)**

* Baca semua file `.json` di folder `user_data/[CLIENT_ID]/` atau download dari Google Sheet
* Dekripsi semua field dengan `decrypt()` (CryptoJS, passphrase `.env`)
* Field boolean (`status`, `exception`) otomatis false jika kosong/null, true/false case-insensitive
* Field user\_id dipad ke 8 digit dengan nol di depan
* Insert/update ke table user
* Parsing Google Sheet: auto mapping berdasarkan header, header sheet tidak di-import

### **C. TikTok Service (tiktokService.js)**

* Ambil `secUid` TikTok dari username via RapidAPI
* Update DB via command `updateclient#CLIENT_ID#tiktok_secUid`

### **D. Crypt.js (util/crypt.js)**

* Fungsi encrypt/decrypt AES berbasis passphrase (.env)
* Kompatibel antar seluruh modul sistem

---

## **Contoh Command WhatsApp**

| Fungsi               | Format Pesan WhatsApp                                           |
| -------------------- | --------------------------------------------------------------- |
| Add client           | `addnewclient#clientid#clientname`                              |
| Update data          | `updateclient#clientid#key#value`                               |
| Update TikTok secUid | `updateclient#clientid#tiktok_secUid` (otomatis dari DB)        |
| Get client info      | `clientinfo#clientid`                                           |
| Remove client        | `removeclient#clientid`                                         |
| List request & key   | `clientrequest`                                                 |
| Migrasi user JSON    | `transferuser#clientid`                                         |
| Migrasi user Sheet   | `sheettransfer#clientid#link_google_sheet`                      |
| Set group client     | `thisgroup#clientid` (hanya dari group WA yang sama)            |
| Absensi IG           | `requestinsta#clientid#sudah` / `requestinsta#clientid#belum`   |
| Absensi TikTok       | `requesttiktok#clientid#sudah` / `requesttiktok#clientid#belum` |

#### **Penjelasan value boolean:**

* `client_status`, `client_insta_status`, `client_tiktok_status` pakai `true` atau `false`
* TikTok dan Instagram cukup isikan username string

---

## **Contoh Data User (JSON terenkripsi)**

```json
{
  "ID_KEY": "U2FsdGVkX19Ru/fVRpXoWtqxbLtvKlXA1t9th1PKYYE=",
  "NAMA": "...",
  "STATUS": "U2FsdGVkX1+PCaPuiKXxG/t+4VrTmuZAP53nqW9LM9I=",
  ...
}
```

* **Semua field di-decrypt otomatis, dan data boolean di-handle aman!**

---

## **Penamaan & Hierarki Function**

* Semua function/method menggunakan prefix sesuai modul (ex: `migrateUsersFromFolder`, `getTiktokSecUid`, dsb)
* Service modular: `clientService`, `tiktokService`, `userMigrationService`
* Konstanta field, mapping dan urutan output jelas dan konsisten

---

## **Maintain & Extensi**

* Tambahkan field baru? Cukup extend mapping & table, serta update logic handler
* Ingin tambah endpoint HTTP? Modularisasi di controller/service sudah siap
* Semua error/exception di-handle dengan balasan WA

---

## **Absensi User per Client (Instagram & TikTok)**

### **Absensi Instagram**

* `requestinsta#clientid#sudah` — menampilkan daftar user yang sudah mengisi data IG (status=true), per divisi.
  Format: `- [title] [nama] : [insta]`
* `requestinsta#clientid#belum` — menampilkan daftar user yang BELUM mengisi IG (status=true), per divisi.
  Format: `- [title] [nama]`

### **Absensi TikTok**

* `requesttiktok#clientid#sudah` — menampilkan daftar user yang sudah mengisi data TikTok (status=true), per divisi.
  Format: `- [title] [nama] : [tiktok]`

* `requesttiktok#clientid#belum` — menampilkan daftar user yang BELUM mengisi TikTok (status=true), per divisi.
  Format: `- [title] [nama]`

* Semua data otomatis mengelompokkan per divisi & menampilkan total user per grup dan per client.

---

## **Meta Data Pengembang**

* **Author:** Rizqo Febryan Prastyo
* **Repo:** [github.com/cicero78M/Cicero\_V2](https://github.com/cicero78M/Cicero_V2)
* **WA Bot Lib:** [whatsapp-web.js](https://github.com/pedroslopez/whatsapp-web.js)
* **Crypto:** [crypto-js](https://github.com/brix/crypto-js)
* **Database:** PostgreSQL (rekomendasi latest)
* **Node.js:** v16+ recommended

---

## **Tips Penting**

* Jangan upload `.wwebjs_auth/` ke repo (cek `.gitignore`)
* Pastikan `.env` berisi key yang sama untuk semua proses encrypt/decrypt
* Backup database sebelum migrasi besar
* Semua file, field, logic sudah kompatibel dengan update/insert massal

---

## **Lisensi**

Open Source - feel free to fork and contribute!

---

*Silakan modifikasi sesuai kebutuhan, atau kontak developer utama untuk integrasi/feature request!*
