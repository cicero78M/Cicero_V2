# Laporan Harian Engagement
*Last updated: 2025-12-03 (task list fallback dari Top/Bottom, client-scoped sections)*

Utility `formatRekapAllSosmed` menyusun narasi laporan gabungan Instagram dan
TikTok untuk setiap klien. Bagian pembuka menyertakan nama klien (berdasarkan
`client_id` yang digunakan di pemanggil) lalu daftar tautan tugas yang
terekstrak dari narasi IG/TT harian. Narasi IG/TT kini otomatis dibatasi
ke segmen yang memuat nama klien terpilih sehingga tautan dan rekap tidak
tercampur dengan satker lain dalam narasi multi-klien.

Cron harian Ditbinmas kini otomatis memanggil narasi IG (laphar Instagram) dan
TT (laphar TikTok), memformati keduanya dengan `formatRekapAllSosmed` lengkap
dengan label klien, lalu
mengirimkan narasi ke seluruh penerima WA sebelum lampiran rekap dikirim.
Jika narasi tidak tersedia, cron tetap mengirim lampiran dan mencatat fallback
di log debug sehingga operator mudah melakukan pengecekan. Narasi IG kini
hanya menampilkan daftar Top 5 dan Bottom 5 Polres berdasarkan likes, sementara
narasi TikTok menampilkan Top 5 dan Bottom 5 Polres berdasarkan jumlah akun
berkomentar sehingga tim cepat melihat rentang performa harian.

## Daftar tautan tugas
- **Instagram:** daftar dibangun dari poin *top content* dan daftar konten lain
  yang sudah berisi likes per tautan. Jika format berbeda, fallback akan
  mengekstrak tautan langsung dari narasi IG. Pada narasi lintas-klien,
  parser hanya memakai blok yang memuat nama klien terpilih sehingga
  tautan milik klien lain tidak ikut terbaca. Jika narasi hanya memuat
  *Top 5 Likes* atau *Bottom 5 Likes* tanpa tautan, sistem otomatis
  mengubah daftar peringkat itu menjadi list tugas (mempertahankan jumlah
  likes) sehingga tidak lagi memunculkan pesan "Belum ada link tercatat".
- **TikTok:** daftar dibangun langsung dari tautan tugas yang disebutkan di
  segmen `*Tugas TikTok*` atau `Daftar Link Konten TikTok` pada narasi harian.
  Sistem menyaring sorotan *Performa tertinggi* maupun *Performa terendah*,
  termasuk ketika highlight tersebut berada tepat di bawah daftar tugas tanpa
  pemisah baris. Pada narasi lintas-klien, parser otomatis memotong segmen
  sesuai nama klien pilihan. Bila tidak ada tautan, laporan kini memakai
  fallback daftar *Top 5 Komentar* dan *Bottom 5 Komentar* (beserta jumlah
  komentar) bila tersedia di narasi.

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
