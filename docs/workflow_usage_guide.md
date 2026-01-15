# Panduan Lengkap Penggunaan Cicero_V2
*Last updated: 2025-07-10*

Dokumen ini menjelaskan alur fungsi utama dan langkah penggunaan aplikasi **Cicero_V2**. Backend ini berjalan bersama dashboard Next.js (lihat repository `Cicero_Web`).

## 1. Persiapan Lingkungan

1. Install Node.js 20 dan PostgreSQL.
2. Jalankan `npm install` untuk mengunduh dependensi (butuh koneksi internet).
3. Salin file `.env.example` menjadi `.env` dan sesuaikan variabel berikut:
   - `PORT`, `DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASS`, `REDIS_URL`, dll.
4. Import skema database dari `sql/schema.sql` ke PostgreSQL.
5. Pastikan Redis dan RabbitMQ (opsional) sudah aktif.

## 2. Menjalankan Aplikasi

```bash
npm start        # menjalankan server produksi
npm run dev      # menjalankan dengan nodemon (hot reload)
```
Server Express akan aktif di port yang ditentukan dan memuat semua route API serta jadwal cron.

## 3. Alur Pekerjaan Backend

1. **Autentikasi** – Endpoint `/api/auth/login` memberikan JWT. Token dipakai pada seluruh request berikutnya.
2. **Pengambilan Data** – Cron harian di `src/cron` mengambil postingan Instagram/TikTok, menyimpan like & komentar, lalu menganalisis hashtag.
3. **Penyimpanan** – Data tersimpan di tabel PostgreSQL seperti `insta_post`, `insta_like`, `tiktok_post`, dll. Struktur lengkap ada di `docs/database_structure.md`.
4. **Notifikasi** – Modul `waService.js` mengirim laporan harian dan pengingat via WhatsApp sesuai jadwal pada `docs/activity_schedule.md`.
5. **Antrian (opsional)** – Tugas berat dapat dikirim ke RabbitMQ melalui `publishToQueue` di `src/service/rabbitMQService.js`.

## 4. Fitur WhatsApp Bot

Bot WhatsApp menyediakan beberapa perintah untuk operator dan pengguna:
- `oprrequest` → mengelola data user dan rekap link harian. Detail pada `docs/wa_operator_request.md`.
- `userrequest` → registrasi dan pengelolaan data user. Lihat `docs/wa_user_registration.md`.
- *Bulk Penghapusan Status User* menggunakan format pesan
  `Permohonan Penghapusan Data Personil – <SATKER>` yang berisi daftar ber-
  nomor `Nama – NRP/NIP – Alasan`. Bot menonaktifkan status, mengosongkan
  WhatsApp, dan mengirim ringkasan sukses/gagal. Header dengan penebalan
  (mis. `📄 **Permohonan ...**`) kini juga dikenali sebagai ringkasan balasan
  bot sehingga tidak diproses ulang jika pesan tersebut dikirim kembali.
- Normalisasi pesan (lowercase dan trim) dilakukan di awal fungsi `processMessage`
  agar seluruh percabangan—termasuk perintah `batal` di menu interaktif—selalu
  menggunakan teks yang sudah stabil tanpa memicu `ReferenceError`.

Sistem menjalankan *dua* nomor WhatsApp:
1. **Nomor utama** menangani seluruh perintah bot seperti `oprrequest`, `dashrequest`, dan lainnya.
2. **Nomor kedua** khusus untuk perintah `userrequest` (registrasi dan pemutakhiran data user).

### Konfigurasi Environment
Tambahkan variabel berikut pada `.env` untuk mengatur sesi WhatsApp:

```
# ID sesi untuk nomor utama (opsional, default `wa-admin`)
APP_SESSION_NAME=wa-admin

# ID sesi untuk nomor kedua (`userrequest`)
USER_WA_CLIENT_ID=wa-userrequest
```

### Langkah Login
1. Jalankan `npm run dev` atau `npm start`.
2. Terminal menampilkan QR `[WA]` untuk nomor utama; pindai dengan akun WhatsApp utama.
3. Terminal juga menampilkan QR `[WA-USER]` untuk nomor kedua; pindai dengan nomor khusus `userrequest`.
4. Setelah dipindai, sesi tersimpan di folder `.wwebjs_auth/` sehingga tidak perlu login ulang.
5. Jika modul web WhatsApp belum siap (`pupPage` tidak tersedia atau evaluasi gagal), sistem mencatat warning dengan `clientId` namun tetap melanjutkan status ready agar alur tidak menggantung.

Pengguna cukup menyimpan nomor bot yang sesuai, mengirim perintah `userrequest`, lalu mengikuti instruksi balasan.

## 5. Akses Dashboard

Dashboard Next.js (`Cicero_Web`) menggunakan variabel `NEXT_PUBLIC_API_URL` untuk terhubung ke backend. Fitur utama di dashboard:
1. Login dengan nomor WhatsApp dan `client_id`.
2. Melihat statistik Instagram/TikTok pada halaman analytics.
3. Mengelola data client dan user melalui antarmuka atau endpoint REST.

Catatan: untuk role **operator**, endpoint statistik dashboard selalu menggunakan `client_id` dari sesi pengguna. Parameter `client_id` dari query string atau header akan diabaikan, dan permintaan ditolak jika sesi tidak memiliki `client_id`.

## 6. Tips Penggunaan

- Jalankan `npm run lint` dan `npm test` sebelum melakukan commit.
- Monitor cron job pada jam yang tercantum di `docs/activity_schedule.md`.
- Gunakan Redis agar permintaan tidak duplikat (`dedupRequestMiddleware.js`).
- Cadangkan database secara rutin (lihat `docs/pg_backup_gdrive.md`).

Dokumen lain seperti `enterprise_architecture.md`, `business_process.md`, dan `metadata_flow.md` dapat dijadikan referensi untuk memahami detail alur data.
