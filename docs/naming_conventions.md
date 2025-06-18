# Konvensi Penamaan
*Last updated: 2025-06-18*

Dokumen ini merangkum gaya penamaan yang digunakan pada proyek **Cicero_V2**. Panduan berikut ditujukan agar struktur kode dan database tetap konsisten.

## Folder & File

- Nama folder ditulis menggunakan huruf kecil tanpa spasi, misalnya `controller`, `service`, `middleware`.
- Nama file mengikuti format *camelCase* dengan ekstensi sesuai bahasa pemrograman (`.js`, `.ts`, dll). Contoh: `userController.js`, `cronInstaService.js`.
- Hindari penggunaan karakter khusus selain tanda hubung (`-`) atau garis bawah (`_`).

## Fungsi

- Semua fungsi menggunakan gaya *camelCase*. Kata pertama huruf kecil diikuti kapital pada awal kata berikutnya, misalnya `getAllUsers`, `createClient`.
- Fungsi bernilai boolean disarankan menggunakan awalan `is` atau `has`, contohnya `isAuthorized`, `hasPermission`.
- Fungsi async sebaiknya diawali kata kerja yang menjelaskan aksi, contohnya `fetchInstagramPosts`, `sendReportViaWA`.

## Database

- Nama tabel memakai gaya `snake_case` dan huruf kecil, misalnya `insta_post`, `tiktok_comment`.
- Nama kolom juga `snake_case`, contohnya `client_id`, `created_at`.
- Primary key tabel diberi suffix `_id` sesuai entitas, misalnya `user_id`, `client_id`.
- Tambahkan indeks pada kolom yang sering digunakan untuk pencarian.

Panduan ini dapat diperluas sesuai kebutuhan namun menjadi acuan dasar dalam penambahan modul baru.
