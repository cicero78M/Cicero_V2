# Laporan Harian Engagement
*Last updated: 2025-11-29 (filters inlined TikTok highlights)*

Utility `formatRekapAllSosmed` menyusun narasi laporan gabungan Instagram dan
TikTok untuk setiap klien. Bagian pembuka menyertakan nama klien (berdasarkan
`client_id` yang digunakan di pemanggil) lalu daftar tautan tugas yang
terekstrak dari narasi IG/TT harian.

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
  mengekstrak tautan langsung dari narasi IG.
- **TikTok:** daftar dibangun langsung dari tautan tugas yang disebutkan di
  segmen `*Tugas TikTok*` atau `Daftar Link Konten TikTok` pada narasi harian.
  Sistem menyaring sorotan *Performa tertinggi* maupun *Performa terendah*,
  termasuk ketika highlight tersebut berada tepat di bawah daftar tugas tanpa
  pemisah baris. Dengan demikian, daftar hanya berisi tautan tugas aktual tanpa
  duplikasi atau outlier hasil sorotan. Bila tidak ada tautan, laporan akan
  menampilkan fallback "Belum ada link tercatat hari ini.".

Dokumen ini membantu operator memahami bagaimana daftar tautan muncul pada
laporan harian serta menyiapkan narasi yang konsisten.
