# Panduan Operator WA Bot
*Last updated: 2025-11-24*

Dokumen ini menjelaskan cara menggunakan perintah `oprrequest` pada Bot WhatsApp **Cicero_V2**. Menu ini hanya untuk operator client dan berguna untuk mengelola data user serta update tugas harian. Hanya nomor operator yang terdaftar pada data client yang dapat mengakses menu ini.

## Cara Masuk Menu Operator
1. Kirim perintah `oprrequest` ke Bot WhatsApp.
2. Jika perintah dikirim dari nomor WhatsApp admin, bot terlebih dahulu
   menampilkan daftar client untuk dipilih. Setelah memilih, nomor admin
   dianggap terdaftar pada client tersebut selama sesi menu berlangsung.
3. Bot menampilkan pilihan berikut:
   - 1️⃣ Tambah user baru
   - 2️⃣ Update data user
   - 3️⃣ Ubah status user (aktif/nonaktif)
   - 4️⃣ Cek data user berdasarkan NRP/NIP
   - 5️⃣ Update tugas Instagram
   - 6️⃣ Rekap link harian
   - 7️⃣ Rekap link harian kemarin
   - 8️⃣ Rekap link per post
   - 9️⃣ Absensi Amplifikasi User
   - 1️⃣0️⃣ Absensi Registrasi User
   - 1️⃣1️⃣ Tugas Khusus
   - 1️⃣2️⃣ Rekap link tugas khusus
   - 1️⃣3️⃣ Rekap per post khusus
   - 1️⃣4️⃣ Absensi Amplifikasi Khusus
   Ketik angka menu yang diinginkan atau `batal` untuk keluar.

## Alur Singkat Setiap Menu
- **Tambah User Baru**
  1. Masukkan NRP/NIP yang belum terdaftar.
  2. Isi nama, pangkat, satfung, dan jabatan sesuai instruksi. Untuk satfung,
     Anda dapat mengetik *nomor urut* pada daftar atau menuliskan namanya secara
     lengkap. Daftar satfung yang ditampilkan hanya berasal dari client Anda.
  3. Bot akan menyimpan data dan mengirim ringkasan user.
- **Ubah Status User**
  1. Masukkan NRP/NIP yang ingin diubah.
  2. Pilih status baru: 1 untuk aktif, 2 untuk nonaktif.
  3. Bot mengonfirmasi perubahan status.
 - **Cek Data User**
  1. Masukkan NRP/NIP user milik client Anda.
  2. Bot menampilkan detail user beserta statusnya jika ditemukan pada client yang sama.
- **Rekap Link Harian**
  1. Bot menampilkan rangkuman link konten yang dikumpulkan hari ini dari semua pengguna di client.
- **Rekap Link Harian Kemarin**
  1. Bot menampilkan rangkuman link konten yang dikumpulkan kemarin dari semua pengguna di client.
- **Update Tugas Instagram**
  1. Bot menjalankan proses pengambilan tugas terbaru untuk client terkait.

### Input Akun Resmi Satbinmas
Untuk menambahkan akun resmi Satbinmas melalui bot:

1. Masuk menu *Client Request* → *Manajemen Client & User* → *Kelola client*.
2. Pilih client tujuan lalu pilih opsi **5️⃣ Input Akun Resmi Satbinmas**.
3. Pilih peran akun (Kasat Binmas, Kasi Binpolmas/Binluh, atau Operator
   Satbinmas/Bhabinkamtibmas).
4. Konfirmasi atau ganti Client ID target.
5. Ketik username Instagram (boleh memakai `@`). Bot memanggil RapidAPI
   `fetchInstagramInfo` untuk menarik `display_name`, `profile_url`, status aktif,
   dan status verifikasi sebelum menyimpan ke tabel
   `satbinmas_official_accounts`.
6. Gunakan `kembali` untuk mengulang peran/Client ID atau `batal` untuk kembali ke
   menu kelola client.

Menu operator ini membantu mengelola user dan memantau laporan secara cepat melalui WhatsApp.
