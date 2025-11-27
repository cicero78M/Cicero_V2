# Aggregator API

Endpoint: `GET /aggregator`

## Purpose
Mengambil gabungan profil dan daftar posting akun Instagram dan TikTok yang terhubung ke klien tertentu.

## Parameters
- **client_id** (query) atau **x-client-id** (header). Bila token autentikasi hanya memiliki satu `client_id`, parameter ini boleh dikosongkan karena nilai akan diambil otomatis dari token tersebut. Jika token memiliki lebih dari satu `client_id`, salah satu di antaranya harus dikirim sebagai parameter. Untuk permintaan yang diautentikasi memakai `client_id` bertipe **direktorat**, backend akan memilih `client_id` default bertipe **direktorat** berdasarkan peran pengguna (misal login direktorat dengan peran `bidhumas` akan diarahkan ke klien direktorat `bidhumas`). Untuk permintaan yang diautentikasi memakai `client_id` bertipe **ORG**, backend akan mengganti `client_id` dengan klien bertipe **direktorat** yang memiliki nama peran sama dengan `client_id` login (misal login ORG dengan peran `ditlantas` akan diarahkan ke klien direktorat `ditlantas`).
- **limit** (query) — opsional, jumlah maksimum posting yang dikembalikan per platform. Nilai non-numerik akan diganti menjadi `10`. Default: `10`.
- **periode** (query) — opsional, `harian` untuk hanya mengambil posting hari ini, selain itu akan mengambil seluruh riwayat yang tersedia.

## Response
- **igProfile**: Profil Instagram (bisa `null` bila tidak ada akun Instagram).
- **igPosts**: Array posting Instagram yang sudah dibatasi oleh `limit`.
- **tiktokProfile**: Profil TikTok (bisa `null` bila tidak ada akun TikTok atau gagal diambil).
- **tiktokPosts**: Array posting TikTok yang sudah dibatasi oleh `limit`.

## Error Cases
- `400 Bad Request` bila `client_id` atau header `x-client-id` tidak dikirim dan token tidak memiliki tepat satu `client_id`.
- `404 Not Found` bila klien tidak ditemukan.
- `500 Internal Server Error` untuk kegagalan tak terduga lainnya.
