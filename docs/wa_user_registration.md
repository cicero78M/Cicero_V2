# Panduan Registrasi User lewat Bot WhatsApp
*Last updated: 2025-08-17*

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
