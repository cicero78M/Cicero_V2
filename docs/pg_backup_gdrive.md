# Otomatisasi Backup PostgreSQL ke Google Drive
*Last updated: 2025-06-18*

## Dokumentasi: Otomatisasi Backup PostgreSQL ke Google Drive dengan Cron dan Rclone

Dokumen ini menjelaskan langkah demi langkah:

1. Prasyarat
2. Instalasi dan konfigurasi rclone
3. Pembuatan skrip backup
4. Pengujian manual skrip
5. Pengaturan cron job
6. Troubleshooting
7. Ringkasan

---

### 1. Prasyarat

* Akses shell pada server Linux (Ubuntu/Debian).
* PostgreSQL terpasang dan database `cicero_db` di-host pada `localhost:5432`.
* Akun PostgreSQL `cicero` dengan password `pass` terdaftar dan memiliki hak `CONNECT, SELECT` pada `cicero_db`.
* Tools:

  * `pg_dump` (biasanya sudah terinstal bersama PostgreSQL client).
  * `gzip` untuk kompresi.
  * `rclone` untuk sinkronisasi ke Google Drive.
  * `cron` untuk scheduler.

---

### 2. Instalasi dan Konfigurasi rclone

1. **Instalasi**:

   ```bash
   curl https://rclone.org/install.sh | sudo bash
   ```

2. **Konfigurasi remote** (headless/server):

   ```bash
   rclone config
   ```

   * Pilih `n` untuk New remote.
   * Isi nama `GDrive` (pastikan case-sensitive).
   * Pilih tipe storage `drive`.
   * Saat ditanya `Use auto config?`, pilih `n`.
   * Salin URL yang muncul, buka di browser lokal, login Google, beri izin, salin kode verifikasi.
   * Kembali ke terminal, paste kode verifikasi.
   * Selesai.

3. **Verifikasi**:

   ```bash
   rclone listremotes
   # Output: GDrive:
   rclone ls GDrive:backups/postgres
   # Jika folder belum ada, output kosong tapi tanpa error.
   ```

---

### 3. Pembuatan Skrip Backup

Buat file `/usr/local/bin/pg_backup.sh` dengan konten:

```bash
#!/usr/bin/env bash
set -euo pipefail

# 1. Variabel konfigurasi
dir_backup="/var/backups/postgres"
REMOTE="GDrive:backups/postgres"
DB_HOST="localhost"
DB_PORT="5432"
DB_USER="cicero"
DB_NAME="cicero_db"

# Timestamp dan nama file
DATE=$(date +"%Y-%m-%d_%H%M")
FILENAME="${DB_NAME}_${DATE}.sql.gz"

# Path lengkap ke binary
PG_DUMP_BIN="/usr/bin/pg_dump"
RCLONE_BIN="/usr/bin/rclone"

# 2. Buat direktori backup jika belum ada
mkdir -p "${dir_backup}"

# 3. Dump dan kompres database
"${PG_DUMP_BIN}" \
  -h "${DB_HOST}" \
  -p "${DB_PORT}" \
  -U "${DB_USER}" \
  "${DB_NAME}" \
  | gzip > "${dir_backup}/${FILENAME}"

# 4. Upload ke Google Drive
echo "Uploading ${FILENAME} to ${REMOTE}..."
"${RCLONE_BIN}" copy "${dir_backup}/${FILENAME}" "${REMOTE}" --quiet

# 5. Hapus backup lokal >7 hari
find "${dir_backup}" -type f -name "${DB_NAME}_*.sql.gz" -mtime +7 -delete

# 6. Logging
echo "Backup ${FILENAME} selesai pada $(date)" >> "${dir_backup}/backup.log"
```

Kemudian:

```bash
sudo chmod 755 /usr/local/bin/pg_backup.sh
```

---

### 4. Pengujian Manual Skrip

1. Jalankan sebagai user `gonet` (agar rclone pakai config milik gonet):

   ```bash
   sudo -u gonet /usr/local/bin/pg_backup.sh
   ```
2. Cek hasil:

   ```bash
   ls -lh /var/backups/postgres
   tail -n 5 /var/backups/postgres/backup.log
   rclone ls GDrive:backups/postgres
   ```

   * Pastikan file `.sql.gz` muncul lokal dan di Google Drive.

---

### 5. Pengaturan Cron Job

1. Buka crontab user `gonet`:

   ```bash
   crontab -u gonet -e
   ```
2. Tambahkan baris berikut untuk menjalankan setiap hari jam 02:30:

   ```cron
   30 2 * * * /usr/local/bin/pg_backup.sh >> /var/backups/postgres/cron.log 2>&1
   ```
3. Simpan dan keluar.
4. Verifikasi entry:

   ```bash
   crontab -u gonet -l
   ```
5. Pastikan cron service aktif:

   ```bash
   sudo systemctl enable --now cron
   systemctl status cron
   ```

Untuk **testing cepat**, ubah schedule menjadi `* * * * *` dan pantau log:

```cron
* * * * * /usr/local/bin/pg_backup.sh >> /var/backups/postgres/cron.log 2>&1
```

---

### 6. Troubleshooting

* **`didn't find section in config file`**: pastikan Anda memanggil rclone sebagai user yang sama dengan yang mengonfigurasi remote (GDrive).
* **`command not found`**: cek `which pg_dump` dan `which rclone`, gunakan path absolut.
* **Log kosong**: tambahkan redirection `>> cron.log 2>&1` agar error tercatat.
* **Permissions**: direktori backup harus writable oleh user cron. Cek `ls -ld /var/backups/postgres`.
* **Cron tidak trigger**: cek `/var/log/syslog` atau `grep CRON /var/log/syslog`.

---

### 7. Ringkasan

Dengan mengikuti langkah-langkah di atas, Anda telah:

* Menginstal dan mengonfigurasi rclone untuk Google Drive.
* Membuat skrip backup otomatis PostgreSQL dengan kompresi.
* Meng-upload hasil backup ke Google Drive.
* Mengatur cron job untuk menjalankan skrip harian.
* Menyertakan logging dan rotasi (hapus >7 hari).

Sistem backup Anda sekarang berjalan otomatis, aman, dan terarsip di cloud.
