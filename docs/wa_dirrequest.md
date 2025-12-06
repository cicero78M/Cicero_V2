# Menu DirRequest untuk Operator WA
*Last updated: 2025-05-23*

Menu **dirrequest** digunakan tim Ditbinmas untuk memicu pengambilan data,
rekap, dan laporan langsung dari WhatsApp. Menu utama menampilkan beberapa
grup seperti Rekap Data, Absensi, Pengambilan Data, hingga Monitoring
Kasatker. Setiap opsi dipilih dengan membalas angka menu sesuai label yang
ditampilkan bot.

## Absensi Komentar TikTok Kasat Binmas
- Submenu Absensi Komentar TikTok mengikuti tanggal **Asia/Jakarta (WIB)**.
  Periode harian yang dipilih dari WhatsApp otomatis menormalkan tanggal ke
  WIB sebelum dikirim ke query database sehingga konten di luar hari berjalan
  tidak ikut dihitung.
- Perhitungan harian/mingguan/bulanan kini memaksa konversi zona waktu ke
  **Asia/Jakarta** secara eksplisit (menggunakan `Intl.DateTimeFormat`)
  sehingga tanggal tidak akan melenceng meski server menjalankan bot dengan
  zona waktu default yang berbeda.
- Alur menu dapat memasok `referenceDate` (mis. menyimpan `session.referenceDate`
  atau `session.dirRequestReferenceDate`) untuk memaksa label periode, rentang
  minggu, serta parameter query memakai tanggal eksekusi yang diinginkan. Jika
  tidak diisi, sistem otomatis memakai `Date.now()` pada zona **Asia/Jakarta**.
- Jika rekap komentar untuk periode yang diminta kosong atau total kontennya
  nol, bot otomatis mengambil konten TikTok Ditbinmas hari ini secara live
  (menggunakan data komentar terkini) untuk menghitung absensi Kasat Binmas.
  Penghitungan tetap memakai filter role aktif dan nama pengguna TikTok yang
  sudah dinormalisasi dari handler absensi untuk menjaga konsistensi.

## Rekap Kelengkapan data Personil Satker (Menu 1)
- Label menu utama diperbarui menjadi **1️⃣ Rekap Kelengkapan data Personil Satker.**
  Contoh cuplikan bagian *Rekap Data* pada menu utama:

  ```
  📊 *Rekap Data*
  1️⃣ Rekap Kelengkapan data Personil Satker.
  2️⃣ Ringkasan pengisian data personel
  3️⃣ Rekap data belum lengkap
  4️⃣ Rekap Matriks Update Satker
  ```
- Fungsionalitas tetap sama: bot mengirim rekap personel yang belum melengkapi
  data dan mengelompokkannya per satker sesuai *Client ID* Direktorat yang aktif.
  Urutan daftar pada rekap kini menempatkan **hanya** client Direktorat
  peminta yang memiliki role sama dengan permintaan di posisi pertama, lalu
  diikuti client bertipe **ORG** yang memiliki role sama dengan *Client ID*
  peminta (client Direktorat lain otomatis diabaikan).
- Filter role menyesuaikan tipe client: permintaan dari client bertipe
  **Direktorat** otomatis memakai role default setara *Client ID* ketika
  operator tidak mengirim *roleFlag*, sedangkan client **ORG** tetap menghargai
  *roleFlag* Direktorat yang valid sehingga rekap hanya menghitung personel
  dengan role tersebut.
  Perhitungan rekap **hanya** memasukkan personel yang memiliki role sesuai
  Direktorat peminta atau role yang sedang difilter, termasuk ketika
  Direktorat merekap client ORG.
- Contoh perilaku filter:
  - Direktorat `DITBINMAS` tanpa `roleFlag` → rekap menghitung personel dengan
    role `DITBINMAS` saja, baik saat membaca client Direktorat sendiri maupun
    client ORG.
  - Direktorat `DITLANTAS` dengan `roleFlag=DITHUMAS` → rekap menyingkirkan
    seluruh personel tanpa role `DITHUMAS`, sehingga hasil bisa terlihat kosong
    jika client tidak memiliki role tersebut.
  - Jika operator memilih Client ID Direktorat yang tidak sama dengan
    `roleFlag`, prioritas filter tetap mengikuti Client ID tersebut, sehingga
    personel dari client bertipe ORG hanya dihitung bila memiliki role yang sama
    dengan Direktorat pilihan.

## Pemilihan Client Direktorat
- Saat mengetik `dirrequest`, bot terlebih dahulu menampilkan daftar
  *Client ID* bertipe **Direktorat** yang berstatus aktif.
- Balas dengan angka pada daftar atau langsung mengetik *Client ID* untuk
  memilih target. Balasan `batal` menutup menu.
- Semua submenu dirrequest (rekap, absensi, monitoring Satbinmas Official,
  dan lainnya) dijalankan berdasarkan *Client ID* yang dipilih sehingga tidak
  selalu bergantung pada default `DITBINMAS`.
- Seluruh menu pada kelompok **Absensi** (opsi 5–11) menggunakan *Client ID*
  pilihan operator untuk rekap dan narasi, termasuk nama direktorat/klien yang
  ditampilkan pada pesan hasil.

## Rekap data belum lengkap (Menu 3)
- Label submenu diperbarui menjadi **Rekap data belum lengkap** tanpa
  menyebutkan Ditbinmas.
- Menu ini mengeksekusi rekap berdasarkan *Client ID* bertipe **Direktorat**
  yang sedang aktif. Data yang diringkas mengikuti role direktorat tersebut
  (misalnya `DITBINMAS`, `DITLANTAS`, atau `BIDHUMAS`) tanpa mengunci hanya ke
  Ditbinmas. Ketika menggunakan role tambahan (*roleFlag*), rekap hanya
  menghitung personel yang memiliki role tersebut dan/atau terikat ke
  *Client ID* peminta.
- Output tetap memuat daftar personel yang belum mengisi Instagram/TikTok per
  divisi beserta salam dan stempel waktu eksekusi.

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

## Automasi Cron BIDHUMAS Malam
- Cron `cronDirRequestBidhumasEvening.js` berjalan setiap hari pukul
  **22:00 WIB**. Urutan eksekusi: memanggil `runDirRequestFetchSosmed()` untuk
  memperbarui data sosmed, lalu menjalankan menu **6** (Instagram likes) dan
  **9** (komentar TikTok) khusus untuk client `BIDHUMAS`.
- Hasil hanya dikirim ke Group WhatsApp BIDHUMAS (`client_group`) dan daftar
  super admin BIDHUMAS (`client_super`). Operator atau admin WhatsApp lainnya
  tidak menerima laporan ini.
- Pengiriman setiap pesan dibatasi jeda **3 detik** per menu/penerima agar tidak
  membanjiri gateway WA; jeda ini hanya memblokir alur BIDHUMAS saja, bukan cron
  lain.

## Automasi Cron DirRequest Custom
- Cron `cronDirRequestCustomSequence` menyambungkan pengambilan data sosmed
  harian dengan menu dirrequest yang sudah ada tanpa perlu input operator.
- Urutan otomatis yang dijalankan:
  1. Memanggil `cronDirRequestFetchSosmed` untuk menarik konten/engagement
     Instagram dan TikTok seluruh direktorat aktif.
  2. Memicu menu **2️⃣1️⃣** (rekap gabungan Ditbinmas) untuk *Client ID*
     `DITBINMAS` dan mengirimkan narasi, file teks, serta Excel rekap ke grup
     WA Ditbinmas yang terkonfigurasi di `client_group`.
  3. Memicu menu **6️⃣** dan **9️⃣** (absensi likes & komentar sederhana) untuk
     *Client ID* `BIDHUMAS` lalu mengirimkan hasilnya ke dua target sekaligus:
     grup WA `client_group` dan daftar Super Admin dari kolom `client_super`.
- Seluruh penerima difilter dengan `normalizeGroupId`/`toWAid` sehingga hanya
  ID WA yang valid yang akan dipakai.
- Debug dan kegagalan menu dicatat lewat `sendDebug` serta dikirim ke daftar
  admin (`ADMIN_WHATSAPP`) agar alur kronologis dan error dapat dilacak tanpa
  membuka dashboard.

## Automasi Rekap Ditbinmas 20:30
- Cron `runDitbinmasRecapSequence` berjalan setiap hari pukul **20:30**
  (Asia/Jakarta) dan hanya memproses *Client ID* **DITBINMAS**.
- Penerima dibagi otomatis berdasarkan kontak Ditbinmas:
  - Menu **6**, **9**, **34**, dan **35** dikirim hanya ke daftar `client_super`.
  - Menu **30** dikirim hanya ke `client_operator`.
- Periode rekap mengikuti tanggal eksekusi:
  - Hari biasa menjalankan rekap harian.
  - Hari Minggu menambahkan rekap mingguan (periode `weekly` untuk menu 34/35
    dan `this_week` untuk menu 30).
  - Hari terakhir bulan menambahkan rekap bulanan (periode `monthly` untuk menu
    34/35 dan `this_month` untuk menu 30).
- Tidak ada client lain yang terpengaruh; cron ini hanya membaca kolom kontak
  Ditbinmas, menormalkan WID dengan `splitRecipientField`/`toWAid`, lalu
  menjalankan menu secara berurutan melalui `executeMenuActions`.
- Setiap pesan antar menu/penerima diberi jeda **3 detik** (`delayAfterSend`)
  untuk menghindari limitasi gateway WA tanpa menahan cron lain.

## Penerima Cron DirRequest
- Cron `cronDirRequestFetchSosmed` kini mengeksekusi **seluruh client bertipe
  Direktorat** yang aktif dengan status **IG** dan **TikTok** aktif. Eksekusi
  dilakukan **berurutan** mengikuti urutan `client_id` dari tabel `clients`.
- Pesan laporan tugas kini dikirim **hanya ke Group WA** milik masing-masing
  client berdasarkan kolom `client_group` (format wajib `@g.us`). Nomor
  **Super Admin** dan **Operator** tidak lagi dipakai untuk cron ini.
- Client Direktorat yang tidak memiliki group valid akan dilewati sehingga
  tidak ada pesan broadcast keluar.
- Seluruh **log proses** cron tetap dikirim ke nomor **ADMIN_WHATSAPP** untuk
  pemantauan admin, sementara pesan tugas/respons hanya dikirim ke Group WA
  per client.
- Pesan tugas **menggunakan nama client** pada salam pembuka (contoh: BID
  HUMAS) sehingga tidak lagi terpaku pada label Ditbinmas.
- Jika akun Direktorat belum memiliki relasi `insta_post_roles`, cron akan
  otomatis membaca konten berdasarkan `client_id` agar daftar tugas tidak
  kosong (misalnya pada client BID HUMAS).
- Cron peringkat, rekap, serta kirim ulang tugas (Engage Rank, Sosmed Rank,
  High/Low, Kasat Binmas, Kasatker, dan Rekap All Sosmed) **dihentikan** sehingga
  hanya pengambilan konten dasar dan pengingat tugas otomatis yang berjalan
  dari bucket dirRequest.
- Pengingat otomatis `cronWaNotificationReminder` tetap berjalan untuk pengguna
  yang mendaftar melalui `notifwa#on` dan masih dikirim ke nomor personal sesuai
  preferensi opt-in.

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
