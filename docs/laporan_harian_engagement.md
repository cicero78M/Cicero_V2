# Laporan Harian Engagement
*Last updated: 2025-12-10 (prioritas peringkat harian dengan guard tanggal)*

Utility `formatRekapAllSosmed` menyusun narasi laporan gabungan Instagram dan
TikTok untuk setiap klien. Bagian pembuka menyertakan nama klien (berdasarkan
`client_id` yang digunakan di pemanggil) lalu daftar tautan tugas dari data
konten harian yang tersimpan di database (prioritas `getPostsTodayByClient`
untuk TikTok dan kueri serupa untuk Instagram). Narasi IG/TT otomatis
dibatasi ke segmen yang memuat nama klien terpilih sehingga tautan dan rekap
tidak tercampur dengan satker lain dalam narasi multi-klien.

Cron harian Ditbinmas kini otomatis memanggil narasi IG (laphar Instagram) dan
TT (laphar TikTok), memformati keduanya dengan `formatRekapAllSosmed` lengkap
dengan label klien, lalu
mengirimkan narasi ke seluruh penerima WA sebelum lampiran rekap dikirim.
Jika narasi tidak tersedia, cron tetap mengirim lampiran dan mencatat fallback
di log debug sehingga operator mudah melakukan pengecekan. Narasi IG kini
hanya menampilkan daftar Top 5 dan Bottom 5 Polres berdasarkan likes, sementara
narasi TikTok menampilkan Top 5 dan Bottom 5 Polres berdasarkan jumlah akun
berkomentar sehingga tim cepat melihat rentang performa harian.

Mulai 10 Desember 2025, `formatRekapAllSosmed` menerima parameter opsional
`igRankingData` dan `ttRankingData` (diisi dari `lapharDitbinmas` dan
`lapharTiktokDitbinmas`). Jika narasi tidak memuat Top/Bottom 5 yang valid,
ranking dibangun ulang dari metrik konten/komentar hari ini selama cap waktu
(`generatedDateKey`) masih sama dengan tanggal laporan. Guard ini memastikan
urutan Top/Bottom selalu mengikuti hasil tugas harian tanpa tercampur data lama
atau klien lain. Mulai perbaikan 2025-12-10, ranking yang valid akan tetap
disisipkan ke narasi (atau ditambahkan sebagai paragraf terpisah) meski teks
narasi tidak menuliskannya, sehingga blok "Top 5" dan "Bottom 5" selalu
tersaji ketika data harian tersedia.

## Daftar tautan tugas
- **Instagram:** daftar dibangun dari data konten harian database (shortcode
  per post hari ini), mempertahankan urutan kronologis unggahan. Jika tidak
  ada data harian, parser memakai daftar *top content* atau tautan langsung di
  narasi IG sebagai fallback. Narasi lintas-klien tetap dipotong agar tautan
  klien lain tidak ikut terbaca.
- **TikTok:** daftar dibangun dari data konten harian database (video_id)
  berdasarkan `client_id` bertipe direktorat. Jika data harian kosong,
  parser kembali ke daftar tugas di narasi atau fallback peringkat
  *Top/Bottom 5 Komentar* beserta jumlah komentar.
- Jika kedua platform tidak memiliki konten harian, narasi link akan
  menampilkan pesan "Tidak ada tugas hari ini" sehingga operator tidak lagi
  melihat tautan yang basi.

## Format narasi
- Seksi laporan kini dipadatkan menjadi dua blok utama: **Instagram** dan
  **TikTok**. Blok *Data Personil* dihilangkan agar ringkasan lebih singkat.
- Catatan penutup kini menyebut nama klien secara dinamis (mis. Direktorat
  tertentu) alih-alih selalu menyebut DITBINMAS.
- Jika narasi TikTok kosong namun memiliki daftar peringkat, laporan tetap
  menampilkan blok *Top 5 Komentar* dan *Bottom 5 Komentar* agar rekap tidak
  kehilangan nama Polres dan jumlah komentar.

Dokumen ini membantu operator memahami bagaimana daftar tautan muncul pada
laporan harian serta menyiapkan narasi yang konsisten.
