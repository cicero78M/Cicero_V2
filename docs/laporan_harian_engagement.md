# Laporan Harian Engagement
*Last updated: 2025-11-27*

Utility `formatRekapAllSosmed` menyusun narasi laporan gabungan Instagram dan
TikTok untuk Ditbinmas. Bagian pembuka menyertakan daftar tautan tugas yang
terekstrak dari narasi IG/TT harian.

## Daftar tautan tugas
- **Instagram:** daftar dibangun dari poin *top content* dan daftar konten lain
  yang sudah berisi likes per tautan. Jika format berbeda, fallback akan
  mengekstrak tautan langsung dari narasi IG.
- **TikTok:** daftar dibangun langsung dari tautan tugas yang disebutkan di
  narasi TikTok. Sistem tidak lagi mencampur sorotan *Performa tertinggi* atau
  *Performa terendah* ke dalam daftar, sehingga urutan dan isian mengikuti
  data mentah tanpa duplikasi buatan. Bila tidak ada tautan, laporan akan
  menampilkan fallback "Belum ada link tercatat hari ini.".

Dokumen ini membantu operator memahami bagaimana daftar tautan muncul pada
laporan harian serta menyiapkan narasi yang konsisten.
