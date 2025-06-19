# Panduan Migrasi Server
*Last updated: 2026-03-01*

Dokumen ini menjelaskan langkah–langkah memindahkan aplikasi **Cicero_V2** ke server baru.
Panduan ditujukan bagi admin sistem agar proses migrasi berlangsung aman tanpa kehilangan data.

## 1. Persiapan

1. **Backup database** menggunakan `pg_dump` atau tool serupa agar seluruh tabel dan data tersimpan.
2. **Catat variabel lingkungan** yang tersimpan pada file `.env` lama (misalnya kredensial database, token API, konfigurasi Redis, dll).
3. Pastikan versi Node.js di server baru kompatibel dengan yang digunakan pada proyek (lihat `package.json`).

## 2. Menyiapkan Server Baru

1. Install dependensi dasar: `git`, `node`, `npm`, serta `postgresql`/database lain yang digunakan.
2. Clone repositori ini ke direktori pilihan:
   ```bash
   git clone https://github.com/cicero78M/Cicero_V2.git
   ```
3. Pindahkan file `.env` hasil salinan dari server lama ke root proyek.
4. Jalankan `npm install` untuk mengunduh dependensi.
5. Import database hasil backup:
   ```bash
   psql -U <user> -d <dbname> -f backup.sql
   ```
6. Sesuaikan konfigurasi `nginx`/`reverse proxy` bila digunakan (lihat
   [docs/reverse_proxy_config.md](reverse_proxy_config.md)).

## 3. Deploy Aplikasi

1. Jalankan script build atau cukup `npm start` jika tidak ada proses build.
2. Uji seluruh endpoint maupun dashboard untuk memastikan data terbaca dengan benar.
3. Apabila menggunakan proses background (cron) pastikan service tersebut aktif di server baru.

## 4. Perpindahan Layanan

1. Hentikan aplikasi pada server lama guna mencegah penulisan data ganda.
2. Alihkan DNS atau IP publik ke server baru.
3. Pantau log aplikasi serta dashboard untuk memastikan tidak ada error.

## 5. Rollback

Simpan backup awal selama beberapa hari. Jika terjadi kendala serius, restore backup
ke server lama atau ke instance baru menggunakan langkah yang sama seperti di atas.

---

Lihat juga dokumen [enterprise_architecture](enterprise_architecture.md) untuk detail arsitektur sistem.

Petunjuk penamaan kode dapat ditemukan di [docs/naming_conventions.md](naming_conventions.md).
