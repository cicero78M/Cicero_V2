# Panduan Registrasi User lewat Bot WhatsApp
*Last updated: 2025-09-24*

Panduan ini menjelaskan langkah–langkah bagi pengguna untuk
menghubungkan nomor WhatsApp ke akun di sistem **Cicero_V2**.

## Langkah Registrasi

1. **Simpan nomor bot** di kontak WhatsApp Anda dan kirim pesan apa saja.
2. Bot akan memeriksa apakah nomor tersebut sudah terdaftar.
   - Jika belum terdaftar, bot membalas meminta NRP/NIP Anda.
3. **Kirim NRP/NIP** sesuai yang ada di database.
4. Bot menampilkan ringkasan data dan meminta konfirmasi.
   - Balas `ya` untuk menghubungkan nomor WhatsApp.
   - Balas `tidak` atau `batal` untuk membatalkan proses.
5. Setelah konfirmasi `ya`, bot memperbarui kolom `whatsapp`
   pada tabel `user` dan menampilkan pemberitahuan berhasil.
6. Ketik `userrequest` kapan saja untuk menampilkan data Anda
   atau memulai proses registrasi kembali.

Proses di atas memastikan setiap pengguna terhubung dengan satu nomor
WhatsApp yang valid. Jika ingin mengganti nomor,
jalankan perintah `userrequest` kembali dan ikuti instruksi yang
muncul.

## Indikator Koneksi & Readiness

- Saat bot meminta pemindaian QR, operator akan melihat log seperti `[WA-USER] Scan QR dengan WhatsApp Anda!`.
- Setelah sesi terhubung, log readiness akan muncul: `[WA-USER] READY via ready`, `[WA-USER] READY via state`, atau fallback `[WA-USER] getState: CONNECTED` lalu `READY via getState` bila event `ready`/`change_state` terlewat.
- Jika koneksi tidak stabil, pastikan sesi WA-USER aktif dan ulangi scan QR. Log `getState error` menandakan koneksi belum siap atau sesi terputus sehingga proses registrasi belum bisa dilanjutkan.
