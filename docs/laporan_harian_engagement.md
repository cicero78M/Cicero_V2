# Laporan Harian Engagement
*Last updated: 2025-11-29 (filters inlined TikTok highlights)*

Utility `formatRekapAllSosmed` menyusun narasi laporan gabungan Instagram dan
TikTok untuk Ditbinmas. Bagian pembuka menyertakan daftar tautan tugas yang
terekstrak dari narasi IG/TT harian.

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
