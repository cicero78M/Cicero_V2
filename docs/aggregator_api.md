# Aggregator API

Endpoint: `GET /aggregator`

## Purpose
Mengambil gabungan profil dan daftar posting akun Instagram dan TikTok yang terhubung ke klien tertentu.

## Parameters
- **client_id** (query) atau **x-client-id** (header) — wajib. Digunakan untuk menentukan klien yang ingin diambil datanya.
- **limit** (query) — opsional, jumlah maksimum posting yang dikembalikan per platform. Nilai non-numerik akan diganti menjadi `10`. Default: `10`.
- **periode** (query) — opsional, `harian` untuk hanya mengambil posting hari ini, selain itu akan mengambil seluruh riwayat yang tersedia.

## Response
- **igProfile**: Profil Instagram (bisa `null` bila tidak ada akun Instagram).
- **igPosts**: Array posting Instagram yang sudah dibatasi oleh `limit`.
- **tiktokProfile**: Profil TikTok (bisa `null` bila tidak ada akun TikTok atau gagal diambil).
- **tiktokPosts**: Array posting TikTok yang sudah dibatasi oleh `limit`.

## Error Cases
- `400 Bad Request` bila `client_id` atau header `x-client-id` tidak dikirim.
- `404 Not Found` bila klien tidak ditemukan.
- `500 Internal Server Error` untuk kegagalan tak terduga lainnya.
