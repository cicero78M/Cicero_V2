# Panduan Redis
*Last updated: 2025-06-18*

Dokumen ini menjelaskan cara konfigurasi dan penggunaan Redis di dalam proyek **Cicero_V2**. Redis digunakan untuk menyimpan token login, cache profil, serta mendeteksi duplikasi permintaan API.

## 1. Instalasi Redis

Pastikan paket `redis-server` terpasang di sistem. Pada distribusi berbasis Debian dapat dijalankan:

```bash
sudo apt-get install redis-server
sudo systemctl enable redis-server
sudo systemctl start redis-server
```

## 2. Konfigurasi Aplikasi

Setel variabel lingkungan `REDIS_URL` pada file `.env` sesuai alamat server Redis, contoh:

```ini
REDIS_URL=redis://localhost:6379
```

Berkas `src/config/redis.js` akan membaca URL tersebut dan membuat klien Redis.

## 3. Penggunaan dalam Cicero_V2

Beberapa modul yang memanfaatkan Redis antara lain:

- `authRoutes.js` – menyimpan token login pengguna dan set token per client.
- `dedupRequestMiddleware.js` – mencegah permintaan ganda dengan hash yang disimpan beberapa menit di Redis.
- `profileCacheService.js` – cache profil Instagram dan TikTok selama satu jam untuk mempercepat respons.

Selain modul di atas, utilitas `requestHash.js` juga berinteraksi dengan Redis untuk menyimpan hash permintaan.

## 4. Membersihkan Data

Saat pengembangan terkadang perlu menghapus seluruh kunci Redis:

```bash
redis-cli FLUSHALL
```

Perintah di atas akan menghapus semua data pada instance Redis yang sedang digunakan.
