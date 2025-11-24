# Panduan Operator WA Bot
*Last updated: 2025-03-11*

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
3. Bot otomatis menetapkan peran menjadi *Akun Resmi Satbinmas* dan memakai
   Client ID aktif dari nomor WhatsApp yang sedang login (tanpa perlu mengetik
   ulang). Gunakan `kembali` jika ingin mengganti Client ID secara manual.
4. Pilih platform (Instagram/TikTok), lalu ketik username (boleh memakai `@`).
   Bot memanggil RapidAPI untuk menarik `display_name`, `profile_url`, status
   aktif, dan status verifikasi sebelum menyimpan ke tabel
   `satbinmas_official_accounts`.
5. Setelah akun tersimpan, bot menanyakan apakah operator ingin menambah akun
   official lain atau mengubah data yang sudah ada. Balasan `tambah` akan
   mengulangi langkah pemilihan platform, sedangkan `ubah` memicu input ulang
   untuk memperbarui data. `selesai`/`batal` kembali ke menu kelola client.

### Permintaan Melalui WA Gateway: `#SatbinmasOfficial`
Permintaan informasi akun resmi Satbinmas dapat dikirim lewat nomor *WA Gateway* dengan mengirim teks `#SatbinmasOfficial` (case-insensitive). Alur dan syaratnya:

1. Selama pesan dikirim ke sesi *WA Gateway* (DM/non-grup), bot otomatis memperlakukan pesan sebagai hasil forward gateway. Tag prefix `wagateway`/`wabot` tetap diterima, tetapi tidak lagi wajib.
2. Balasan yang ditandai WhatsApp sebagai *status message* (termasuk balasan angka ke prompt) tetap diproses selama dikirim lewat chat pribadi gateway; hanya pesan dari `status@broadcast` yang diabaikan.
3. Nomor pengirim wajib terdaftar pada tabel `dashboard_user` dengan status aktif dan bukan berperan sebagai operator. Jika nomor tidak terdaftar, bot akan mengirim pesan penolakan.
4. Relasi ke client melalui tabel `dashboard_user_clients` harus ada. Jika dashboard user tidak memiliki client aktif, permintaan ditolak dengan pesan aman.
5. Bot memetakan client utama (ID pertama pada relasi), mengambil detail client (misalnya nama/Polres), lalu menarik daftar akun resmi Satbinmas via `satbinmas_official_accounts`.
6. Respons mencantumkan: Client ID, nama Polres, role dashboard yang digunakan, dan daftar akun resmi per platform (IG/TikTok) lengkap dengan status aktif, status centang biru (verifikasi akun), serta *Link profile* yang otomatis diisi dari URL tersimpan atau dibangunkan dari username ketika URL kosong. Jika URL tersimpan bukan berasal dari domain platform (misalnya tautan CDN foto), tautan akan diganti menjadi URL profil resmi sesuai platform—contoh: `https://www.instagram.com/mulyadi.bejo.2` untuk Instagram. Jika belum ada akun resmi yang tercatat, respons akan menambahkan pertanyaan "Apakah Anda ingin menambahkan akun sosial media official Satbinmas Anda?" dan menunggu balasan *ya* atau *batal*.
7. Balasan *ya* akan langsung memulai alur input akun resmi Satbinmas dengan menggunakan Client ID yang sama, sehingga operator bisa melanjutkan penambahan akun tanpa menavigasi ulang menu.

Contoh respons:
```
📡 Data Akun Resmi Satbinmas
Client ID : MKS01
Polres    : Polrestabes Makassar
Role      : admin
Dashboard : admin_makassar

Akun Resmi:
1. [Instagram] @satbinmas_mks
   Status: Aktif
   Display Name: Satbinmas Makassar
   Centang Biru: Belum
   Link profile: https://instagram.com/satbinmas_mks
2. [TikTok] @satbinmas.tiktok
   Status: Nonaktif
   Display Name: Satbinmas Tiktok
   Centang Biru: Sudah
   Link profile: -
```

Menu operator ini membantu mengelola user dan memantau laporan secara cepat melalui WhatsApp.
