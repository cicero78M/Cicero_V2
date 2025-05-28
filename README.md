# Cicero\_V2 WhatsApp Bot System

Sistem WA bot untuk manajemen data client organisasi, sinkronisasi data client & user (termasuk migrasi user terenkripsi dari JSON/Spreadsheet ke PostgreSQL), serta integrasi data TikTok secUid berbasis API.
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
* **Seluruh request WhatsApp hanya dapat diakses nomor yang terdaftar di variabel `ADMIN_WHATSAPP` (.env) untuk clientrequest/admin, serta proteksi nomor unik pada data user untuk userrequest**
* **Nomor WhatsApp hanya bisa bind ke satu user**
* **Username IG & TikTok wajib unik**

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
│   └── [POLRES]/*.json            # File user per client terenkripsi
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

* Handler terpusat untuk semua pesan WA.
* Parsing perintah, validasi akses nomor WhatsApp (ADMIN\_WHATSAPP atau nomor user sesuai DB).
* Otomatis binding WhatsApp ke user jika masih null, **proteksi tidak ada duplikasi nomor**.
* Proteksi username IG/TikTok unik.
* Balasan otomatis untuk seluruh error/validasi.
* Mapping istilah POLRI:

  * user\_id → NRP/NIP
  * divisi  → Satfung
  * title   → Pangkat
  * client\_id → POLRES
  * status: true → AKTIF, false → AKUN DIHAPUS

---

## **Command WhatsApp**

### **A. clientrequest (Hanya untuk ADMIN)**

| Fungsi               | Format WhatsApp                                             |
| -------------------- | ----------------------------------------------------------- |
| Add client           | `addnewclient#POLRES#Nama Polres`                           |
| Update data          | `updateclient#POLRES#key#value`                             |
| Update TikTok secUid | `updateclient#POLRES#tiktok_secUid`                         |
| Get client info      | `clientinfo#POLRES`                                         |
| Remove client        | `removeclient#POLRES`                                       |
| Daftar command admin | `clientrequest`                                             |
| Migrasi user JSON    | `transferuser#POLRES`                                       |
| Migrasi user Sheet   | `sheettransfer#POLRES#link_google_sheet`                    |
| Set group client     | `thisgroup#POLRES` (harus dikirim dari grup WA)             |
| Absensi IG           | `requestinsta#POLRES#sudah` / `requestinsta#POLRES#belum`   |
| Absensi TikTok       | `requesttiktok#POLRES#sudah` / `requesttiktok#POLRES#belum` |

### **B. userrequest (Bisa diakses user, proteksi nomor & validasi data)**

| Fungsi              | Format WhatsApp                                           |
| ------------------- | --------------------------------------------------------- |
| Lihat data user     | `mydata#NRP/NIP`                                          |
| Update nama         | `updateuser#NRP/NIP#nama#Nama Lengkap`                    |
| Update pangkat      | `updateuser#NRP/NIP#pangkat#NAMA_PANGKAT`                 |
| Update satfung      | `updateuser#NRP/NIP#satfung#NAMA_SATFUNG`                 |
| Update jabatan      | `updateuser#NRP/NIP#jabatan#NAMA_JABATAN`                 |
| Update Instagram    | `updateuser#NRP/NIP#insta#https://instagram.com/username` |
| Update TikTok       | `updateuser#NRP/NIP#tiktok#https://tiktok.com/@username`  |
| Bind WhatsApp       | `updateuser#NRP/NIP#whatsapp#62812xxxxxx`                 |
| Daftar command user | `userrequest`                                             |

**Catatan & Validasi User:**

* **Nomor WhatsApp hanya bisa bind ke satu user (NRP/NIP)**
* **Username IG & TikTok wajib unik seluruh sistem**
* **Validasi otomatis link Instagram/TikTok: hanya boleh link profil**
* **Update field pangkat/satfung/jabatan hanya bisa value sesuai referensi DB, jika salah bot membalas dengan list data yang valid (berdasarkan POLRES/client yang sama)**
* **Perubahan hanya bisa dilakukan oleh nomor WhatsApp terdaftar, atau akan di-bind otomatis jika field whatsapp masih kosong**

---

## **Format Response POLRI**

* NRP/NIP → user\_id
* Satfung → divisi
* Pangkat → title
* POLRES → client\_id
* status:

  * true → AKTIF
  * false → AKUN DIHAPUS
* **Field exception tidak pernah ditampilkan ke user!**

---

## **Absensi User per Client (Instagram & TikTok)**

* `requestinsta#POLRES#sudah` — daftar user AKTIF (status=AKTIF) sudah IG, per Satfung:
  `- [Pangkat] [Nama] : [insta]`
* `requestinsta#POLRES#belum` — daftar user AKTIF belum IG, per Satfung:
  `- [Pangkat] [Nama]`
* TikTok sama:

  * `requesttiktok#POLRES#sudah`
  * `requesttiktok#POLRES#belum`

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

**CICERO : Solus Sed Invictus**