# Konfigurasi Nginx/Reverse Proxy
*Last updated: 2026-04-01*

Dokumen ini memberikan contoh konfigurasi dasar untuk menjalankan aplikasi **Cicero_V2** di balik `nginx` atau reverse proxy lainnya. Pengaturan ini opsional namun berguna agar port aplikasi tidak diakses langsung oleh klien.

## 1. Prasyarat

- Aplikasi telah dijalankan dengan `npm start` pada port yang ditentukan di `.env` (default `3000`).
- Nginx terpasang di server.

## 2. Contoh Konfigurasi

Buat file konfigurasi baru misalnya `/etc/nginx/sites-available/cicero` kemudian isi seperti berikut:

```nginx
server {
    listen 80;
    server_name contoh.domain.com;

    location / {
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header Host $host;
        proxy_pass http://127.0.0.1:3000;
    }
}
```

Aktifkan konfigurasi tersebut dengan:

```bash
sudo ln -s /etc/nginx/sites-available/cicero /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

Konfigurasi di atas meneruskan seluruh permintaan pada port 80 ke aplikasi Node.js yang berjalan pada `localhost:3000`.

## 3. HTTPS (Opsional)

Jika menggunakan HTTPS, sertifikat dapat diatur via `certbot` atau penyedia lain. Pastikan bagian `server` diperbarui dengan `listen 443 ssl;` dan `ssl_certificate` yang sesuai.

## 4. Referensi Lain

Lihat [docs/server_migration.md](server_migration.md) untuk panduan lengkap menyiapkan server baru.

Petunjuk penamaan kode dapat ditemukan di [docs/naming_conventions.md](naming_conventions.md).
