# Laporan Harian Engagement
*Last updated: 2025-11-24*

Utility `formatRekapAllSosmed` menyusun narasi laporan gabungan Instagram dan
TikTok untuk Ditbinmas. Bagian pembuka menyertakan daftar tautan tugas yang
terekstrak dari narasi IG/TT harian.

## Daftar tautan tugas
- **Instagram:** daftar dibangun dari poin *top content* dan daftar konten lain
  yang sudah berisi likes per tautan. Jika format berbeda, fallback akan
  mengekstrak tautan langsung dari narasi IG.
- **TikTok:** daftar kini memprioritaskan sorotan *Performa tertinggi* dan
  *Performa terendah*. Bila ada tautan terpisah di narasi, sistem otomatis
  menempelkan URL tersebut ke sorotan yang bersesuaian, sehingga daftar tampil
  seperti Instagram (lengkap dengan judul konten dan metrik). Jika sorotan
  kosong, tautan mentah dari narasi TikTok dipakai sebagai cadangan.

Dokumen ini membantu operator memahami bagaimana daftar tautan muncul pada
laporan harian serta menyiapkan narasi yang konsisten.
