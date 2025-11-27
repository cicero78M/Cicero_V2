# Panduan Respon Komplain

Modul `respondComplaint` menyampaikan langkah tindak lanjut kepada pelapor saat laporan aktivitas media sosial belum tercatat. Ringkasan panduan yang dikirim ke pelapor menekankan pengecekan kembali likes Instagram dan komentar TikTok.

## Langkah verifikasi yang dikirim
- Pastikan aksi dilakukan dengan akun yang tercatat di Cicero.
- Lampirkan tautan konten beserta waktu pelaksanaan untuk pengecekan.
- Gunakan menu **Absensi Likes Instagram** atau **Absensi Komentar TikTok** di dashboard Cicero, pilih ulang satker dan periode, lalu tekan **Refresh** untuk memuat data terbaru.
- Jika data masih belum tercatat setelah sinkronisasi sekitar satu jam, kirim bukti tangkapan layar dan eskalasi ke operator piket.

Catatan: Narasi lama yang menyebut "Absensi Amplifikasi" sudah diganti agar selaras dengan terminologi likes/komentar di Instagram dan TikTok.

## Perilaku sesi setelah respon
- Setelah pesan komplain dibalas dan ringkasan admin dikirim, sesi menu *Client Request* ditutup otomatis.
- Penutupan sesi mencegah pengiriman ulang pesan menu utama seperti:
  ```
  ┏━━━ *MENU CLIENT CICERO* ━━━
  1️⃣ Manajemen Client & User
  2️⃣ Operasional Media Sosial
  3️⃣ Transfer & Laporan
  4️⃣ Administratif
  ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Ketik *angka* menu, atau *batal* untuk keluar.
  ```
- Admin dapat membuka kembali menu dengan perintah `clientrequest` bila diperlukan.
