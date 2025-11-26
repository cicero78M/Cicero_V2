# Menu DirRequest untuk Operator WA
*Last updated: 2026-02-20*

Menu **dirrequest** digunakan tim Ditbinmas untuk memicu pengambilan data,
rekap, dan laporan langsung dari WhatsApp. Menu utama menampilkan beberapa
grup seperti Rekap Data, Absensi, Pengambilan Data, hingga Monitoring
Kasatker. Setiap opsi dipilih dengan membalas angka menu sesuai label yang
ditampilkan bot.

## Monitoring Satbinmas Official
Grup menu terbaru di bagian bawah menambahkan alur khusus untuk memantau akun
resmi Satbinmas.

- **3️⃣6️⃣ Ambil metadata harian IG Satbinmas Official**
  1. Pilih opsi **3️⃣6️⃣** dari menu dirrequest.
  2. Bot menampilkan prompt *Monitoring Satbinmas Official* yang otomatis
     memakai *Client ID* aktif (default `DITBINMAS`).
  3. Balas dengan format `username` atau `CLIENT_ID username` jika ingin
     mengecek akun Satbinmas milik client lain. Contoh: `satbinmas_official`
     atau `MKS01 satbinmas_official`.
  4. Bot memanggil layanan RapidAPI (`fetchInstagramInfo`) untuk menarik
     metadata profil Instagram (nama, followers, postingan, status verifikasi,
     dan privasi).
  5. Hasil dikirim kembali ke operator dalam satu pesan ringkasan. Jika
     metadata tidak ditemukan atau layanan gagal diakses, bot menampilkan pesan
     kegagalan beserta alasan singkat.
  6. Balasan `batal` kapan pun akan menutup alur ini dan kembali ke menu utama
     dirrequest.

- **3️⃣7️⃣ Ambil konten harian IG Satbinmas Official**
  1. Pilih opsi **3️⃣7️⃣**. Bot langsung mengeksekusi tanpa menunggu balasan.
  2. Sistem otomatis memuat seluruh akun Instagram Satbinmas Official untuk
     setiap client bertipe `ORG` dari tabel `satbinmas_official_accounts`
     (tanpa filter `is_active`), dieksekusi berurutan per client dengan jeda
     agar tidak melanggar rate limit RapidAPI.
  3. RapidAPI Instagram dipanggil melalui
     `fetchTodaySatbinmasOfficialMediaForOrgClients` untuk menarik konten hari
     berjalan (filter `taken_at` hari ini) dan menormalkan metadata, termasuk
     hashtag dan mention ke tabel terpisah.
  4. Operator menerima rekap yang otomatis dikelompokkan menjadi tiga bagian:
     akun aktif (konten hari ini, diurut dari jumlah konten tertinggi), akun
     pasif (sudah terdaftar tetapi belum memuat konten), dan daftar client ORG
     yang belum pernah memasukkan akun Satbinmas Official. Nama polres dipakai
     apabila tersedia agar mudah dibaca. Rekap tetap memuat ringkasan agregat
     dan daftar akun yang gagal diproses jika ada.

- **3️⃣8️⃣ Sinkronisasi secUid TikTok Satbinmas Official**
  1. Pilih opsi **3️⃣8️⃣** untuk memicu sinkronisasi otomatis tanpa perlu
     membalas username.
  2. Bot mengambil seluruh akun TikTok Satbinmas Official dari tabel
     `satbinmas_official_accounts` milik *semua* client bertipe `ORG`, lalu
     memanggil RapidAPI TikTok (`fetchTiktokProfile`) satu per satu untuk
     menarik `secUid` terbaru dengan jeda aman.
  3. Setiap hasil sukses disimpan kembali ke kolom `secuid` melalui layanan
     `syncSatbinmasOfficialTiktokSecUidForOrgClients`, sementara kegagalan
     (username kosong, konflik, atau RapidAPI error) dicatat dalam ringkasan.
  4. Operator menerima rekap agregat (jumlah client, akun berhasil, akun gagal)
     beserta daftar client tanpa akun TikTok yang terdaftar.

- **3️⃣9️⃣ Ambil konten harian TikTok Satbinmas Official**
  1. Pilih opsi **3️⃣9️⃣**. Bot langsung mengeksekusi tanpa menunggu balasan.
  2. Sistem otomatis memuat seluruh akun TikTok Satbinmas Official untuk setiap
     client bertipe `ORG` dari tabel `satbinmas_official_accounts` dan mengeksekusi
     berurutan per client dengan jeda agar aman dari batas RapidAPI.
  3. RapidAPI TikTok dipanggil melalui
     `fetchTodaySatbinmasOfficialTiktokMediaForOrgClients` untuk menarik konten
     yang dibuat hari ini (berdasarkan `createTime`).
  4. Seluruh profil, konten, dan hashtag tersimpan di tabel
     `satbinmas_tiktok_accounts`, `satbinmas_tiktok_posts`, dan
     `satbinmas_tiktok_post_hashtags`.
  5. Operator menerima rekap otomatis dengan format baru: periode pengambilan
     data, total polres/akun/konten, daftar akun aktif (urutan konten tertinggi
     beserta likes dan komentar per akun), akun pasif, serta client ORG yang
     belum memiliki akun TikTok terdaftar. Kegagalan per akun juga dicantumkan.

Opsi ini membantu Ditbinmas memantau kesiapan akun resmi Satbinmas tanpa harus
berpindah ke dashboard web atau menjalankan skrip manual.

## RapidAPI (Instagram & TikTok)
- Semua opsi di grup *Monitoring Satbinmas Official* membutuhkan kredensial
  RapidAPI. Pastikan variabel lingkungan `RAPIDAPI_KEY` terisi sebelum bot
  dijalankan.
- TikTok memakai host `tiktok-api23.p.rapidapi.com` melalui
  `fetchTiktokProfile` untuk mengambil `secUid`. Instagram memakai host yang
  sama via fungsi `fetchInstagramInfo` dan `fetchInstagramPosts`.
