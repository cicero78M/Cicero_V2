# Menu DirRequest untuk Operator WA
*Last updated: 2025-12-03*

Menu **dirrequest** digunakan tim Ditbinmas untuk memicu pengambilan data,
rekap, dan laporan langsung dari WhatsApp. Menu utama menampilkan beberapa
grup seperti Rekap Data, Absensi, Pengambilan Data, hingga Monitoring
Kasatker. Setiap opsi dipilih dengan membalas angka menu sesuai label yang
ditampilkan bot.

## Pemilihan Client Direktorat
- Saat mengetik `dirrequest`, bot terlebih dahulu menampilkan daftar
  *Client ID* bertipe **Direktorat** yang berstatus aktif.
- Balas dengan angka pada daftar atau langsung mengetik *Client ID* untuk
  memilih target. Balasan `batal` menutup menu.
- Semua submenu dirrequest (rekap, absensi, monitoring Satbinmas Official,
  dan lainnya) dijalankan berdasarkan *Client ID* yang dipilih sehingga tidak
  selalu bergantung pada default `DITBINMAS`.

## Monitoring Satbinmas Official
Grup menu terbaru di bagian bawah menambahkan alur khusus untuk memantau akun
resmi Satbinmas. Menu utama kini menampilkan rentang opsi **3️⃣6️⃣–4️⃣1️⃣** untuk
alur ini sehingga operator bisa langsung memilih pengambilan data maupun
rekap.

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
  4. Operator menerima rekap harian yang memuat periode pengambilan data,
     total polres/akun/konten (tanpa rincian baru/update/gagal), daftar akun
     aktif (urutan konten tertinggi) lengkap dengan total likes dan komentar
     per akun, akun pasif, serta client ORG yang belum pernah memasukkan akun
     Satbinmas Official. Nama polres dipakai apabila tersedia agar mudah
     dibaca. Rekap tetap memuat daftar akun yang gagal diproses jika ada.

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

- **4️⃣0️⃣ Rekap Instagram Satbinmas Official**
  1. Pilih opsi **4️⃣0️⃣** untuk membuka submenu rekap.
  2. Bot menampilkan pilihan periode: **1. Harian** (hari ini), **2. Mingguan**
     (Senin–Minggu berjalan), dan **3. Bulanan** (tanggal 1 s/d akhir bulan
     berjalan).
  3. Balasan angka **1–3** hanya membaca rekap yang sudah ada di tabel
     `satbinmas_official_media`; tidak ada pemanggilan RapidAPI.
  4. Operator menerima ringkasan berformat sama dengan rekap harian: klasifikasi
     akun aktif/pasif/belum input dengan label periode, total konten, beserta
     total likes dan komentar per akun.
  5. Balasan `batal`, `0`, atau `kembali` menutup submenu dan kembali ke menu
     utama tanpa menjalankan proses apa pun.

- **4️⃣1️⃣ Rekap TikTok Satbinmas Official**
  1. Pilih opsi **4️⃣1️⃣** untuk membuka submenu rekap TikTok.
  2. Submenu menawarkan periode **1. Harian** (hari ini), **2. Mingguan**
     (Senin–Minggu berjalan), dan **3. Bulanan** (tanggal 1 s/d akhir bulan
     berjalan) yang semuanya memakai data tersimpan di tabel
     `satbinmas_tiktok_posts` yang terhubung lewat `secUid` akun Satbinmas
     Official.
  3. Tidak ada pemanggilan RapidAPI; rekap dibangun dari agregasi data lokal
     (total konten, likes, komentar per akun) dan tetap menandai akun yang
     belum memiliki `secUid` tersinkron.
  4. Hasil dikirim sebagai pesan ringkasan ke operator. Balasan `batal`, `0`,
     atau `kembali` akan menutup submenu dan kembali ke menu utama.

- **Catatan pemanggilan data**
  - Menu **3️⃣7️⃣** dan **3️⃣9️⃣** tetap menjalankan pengambilan konten via
    RapidAPI (Instagram/TikTok) sebelum disimpan dan diringkas.
  - Menu rekap **4️⃣0️⃣** dan **4️⃣1️⃣** tidak memanggil RapidAPI; outputnya murni
    berasal dari data yang sudah tersimpan di database.

Opsi ini membantu Ditbinmas memantau kesiapan akun resmi Satbinmas tanpa harus
berpindah ke dashboard web atau menjalankan skrip manual.

## Automasi Cron Satbinmas Official
- Cron `cronDirRequestSatbinmasOfficialMedia` menjalankan menu **3️⃣7️⃣** dan
  **3️⃣9️⃣** secara berurutan setiap hari pukul **13.05** dan **22.05**
  (zona waktu Asia/Jakarta).
- Rekap dikirim hanya ke daftar admin WhatsApp (`ADMIN_WHATSAPP`). Cron ini
  tidak mengirim laporan ke Super Admin, Operator, atau Group WA dan akan
  dilewati jika tidak ada admin penerima yang valid.

## Penerima Cron DirRequest
- Cron `cronDirRequestFetchSosmed` kini mengeksekusi **seluruh client bertipe
  Direktorat** yang aktif dengan status **IG** dan **TikTok** aktif. Eksekusi
  dilakukan **berurutan** mengikuti urutan `client_id` dari tabel `clients`.
- Untuk `DITBINMAS`, laporan dikirim ke **Group WA** yang tersimpan di kolom
  `client_group` (format wajib `@g.us`).
- Untuk `BIDHUMAS`, laporan dikirim ke nomor **Super Admin** dan **Operator**
  (`client_super` dan `client_operator`) yang diubah menjadi WID `@c.us`.
- Client Direktorat lain menggunakan **Group WA** masing-masing dari
  `client_group`. Jika kolom kosong/tidak valid maka laporan dilewati untuk
  client tersebut.
- Seluruh **log proses** cron tetap dikirim ke nomor **ADMIN_WHATSAPP** untuk
  pemantauan admin, sementara pesan tugas/respons dan perubahan post hanya
  dikirim ke penerima Group/Super Admin/Operator sesuai aturan di atas.
- Cron `cronDirRequestRekapAllSocmed` tetap dikunci hanya ke **Group WA**
  Ditbinmas (menonaktifkan admin, super admin, dan operator) agar broadcast
  rekap harian tidak lagi dikirim ke nomor pribadi.

### Format Nomor Super Admin & Operator
- Kolom `client_super` dan `client_operator` menerima:
  - Nomor lokal dengan awalan `0`, misalnya `0812-3456-7890` → distandarkan ke
    `6281234567890@c.us`.
  - Nomor internasional yang sudah berawalan `62`, misalnya `6281234567890` →
    tetap `6281234567890@c.us`.
  - WID yang sudah memiliki sufiks `@c.us` atau `@s.whatsapp.net` akan
    dipertahankan apa adanya selama digit angkanya valid.
- Token non-numerik (seperti `not-a-number`) atau nomor dengan digit kurang
  dari **8 angka** akan ditolak sehingga penerima tidak akan disertakan di
  daftar `recipients` cron.

### Format Grup WA untuk DirRequest
- Kolom `client_group` menerima beberapa variasi input untuk grup Ditbinmas dan
  Direktorat lain:
  - ID grup penuh seperti `120363419830216549@g.us` (huruf besar/kecil diabaikan).
  - ID numerik tanpa sufiks seperti `120363419830216549`, yang otomatis akan
    ditambahkan `@g.us` ketika pola ID grup valid.
  - Tautan undangan WhatsApp seperti
    `https://chat.whatsapp.com/invite/120363419830216549` atau
    `https://chat.whatsapp.com/120363419830216549`; bagian undangan akan dibuang
    dan token numerik di ujung akan dipakai.
- Spasi di awal/akhir akan dihilangkan sebelum validasi. Hanya token numerik
  sepanjang 10–22 digit yang lolos dan diubah menjadi format standar
  `<ID>@g.us`; token lain atau undangan dengan kode huruf akan diabaikan sehingga
  laporan untuk client tersebut tidak dikirim.

## RapidAPI (Instagram & TikTok)
- Opsi pengambilan konten (**3️⃣6️⃣**, **3️⃣7️⃣**, **3️⃣8️⃣**, **3️⃣9️⃣**) membutuhkan
  kredensial RapidAPI. Pastikan variabel lingkungan `RAPIDAPI_KEY` terisi
  sebelum bot dijalankan.
- TikTok memakai host `tiktok-api23.p.rapidapi.com` melalui
  `fetchTiktokProfile` untuk mengambil `secUid`. Instagram memakai host yang
  sama via fungsi `fetchInstagramInfo` dan `fetchInstagramPosts`.
- Menu rekap (**4️⃣0️⃣**, **4️⃣1️⃣**) hanya membaca database sehingga tetap dapat
  dipakai ketika RapidAPI tidak tersedia, selama data konten sudah ada di
  tabel yang disebutkan di atas.
